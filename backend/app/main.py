"""
FastAPI application — Restaurant Visitor Tracker.

Detects persons via webcam/upload, auto-registers first-time visitors,
recognises returning visitors (ArcFace gallery), tracks visit sessions, and
serves visitor + analytics APIs for the dashboard.
"""

import os

# Configure CPU thread usage for all math backends BEFORE numpy/torch/onnxruntime
# are imported (they read the thread count once at import time). Default: every
# physical core. Only affects CPU-mode inference; harmless when running on GPU.
_cpu_threads = os.environ.get("CPU_THREADS", "").strip()
if not _cpu_threads or _cpu_threads == "0":
    _cpu_threads = str(os.cpu_count() or 1)
for _var in (
    "OMP_NUM_THREADS",
    "MKL_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "NUMEXPR_NUM_THREADS",
):
    os.environ[_var] = _cpu_threads

# Never let Ultralytics pip-install missing requirements at runtime. With
# `onnxruntime-gpu` installed, the distribution is named "onnxruntime-gpu" so
# Ultralytics' `importlib.metadata.version("onnxruntime")` check fails and it
# tries to reinstall "onnxruntime" on every warmup — which fails (the DLL is in
# use) and, under `uvicorn --reload`, retriggers an endless reload loop.
os.environ.setdefault("YOLO_AUTOINSTALL", "False")

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from time import perf_counter

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal, engine, get_db, init_db
from app.ml_models import ModelManager
from app.models import Visit, Visitor
from app.schemas import HealthResponse
from app.services.camera_manager import CameraManager, parse_cameras_config
from app.services.visit_tracker import VisitTracker
from app.services.gate_tracker import GateVisitTracker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

_background_tasks: set = set()


async def _stale_visit_loop():
    """Periodically close visits idle past the cooldown / open past the max cap,
    and abandon gate passes whose exit was never seen."""
    tracker = VisitTracker.get_instance()
    gate_tracker = GateVisitTracker.get_instance()
    while True:
        await asyncio.sleep(settings.STALE_CHECK_INTERVAL_SECONDS)
        try:
            async with AsyncSessionLocal() as db:
                # Collapse any duplicate open visits per visitor (e.g. left by a
                # merge) before the idle/max-duration close pass.
                await tracker.reconcile_open_visits(db)
                await tracker.cleanup_stale(db)
                await gate_tracker.cleanup_stale(db)
        except Exception as exc:
            logger.warning("Stale-visit cleanup failed: %s", exc)


async def _auto_tuning_loop():
    """Run weekly threshold auto-tuning."""
    from app.services.auto_tuning import run_auto_tuning
    interval = settings.AUTO_TUNING_INTERVAL_DAYS * 86400
    await asyncio.sleep(interval)  # first run after one full interval
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await run_auto_tuning(db)
                logger.info("Auto-tuning result: %s", result)
        except Exception as exc:
            logger.warning("Auto-tuning run failed: %s", exc)
        await asyncio.sleep(interval)


async def _purge_in_batches(db: AsyncSession, sql: str, params: dict, label: str) -> int:
    """Delete matching rows in bounded batches so each DELETE stays short and
    never holds a long lock on the local database. Returns the total removed."""
    batch = max(100, int(settings.RETENTION_PURGE_BATCH_SIZE))
    total = 0
    while True:
        result = await db.execute(text(sql), {**params, "batch": batch})
        await db.commit()
        removed = result.rowcount or 0
        total += removed
        if removed < batch:
            break
        await asyncio.sleep(0)  # yield to the event loop between batches
    if total:
        logger.info("Retention purge removed %d %s.", total, label)
    return total


async def _retention_loop():
    """Purge visitors whose last_seen_at is older than the retention window, and
    (separately) old detection_events. Both are batched and local-only."""
    if settings.VISITOR_RETENTION_DAYS <= 0 and settings.DETECTION_EVENT_RETENTION_DAYS <= 0:
        return
    while True:
        now = datetime.now(timezone.utc)
        try:
            async with AsyncSessionLocal() as db:
                if settings.VISITOR_RETENTION_DAYS > 0:
                    cutoff = now - timedelta(days=settings.VISITOR_RETENTION_DAYS)
                    await _purge_in_batches(
                        db,
                        "DELETE FROM visitors WHERE id IN ("
                        "  SELECT id FROM visitors"
                        "  WHERE last_seen_at IS NOT NULL AND last_seen_at < :cutoff"
                        "  LIMIT :batch)",
                        {"cutoff": cutoff},
                        "visitor(s)",
                    )
                if settings.DETECTION_EVENT_RETENTION_DAYS > 0:
                    de_cutoff = now - timedelta(days=settings.DETECTION_EVENT_RETENTION_DAYS)
                    await _purge_in_batches(
                        db,
                        "DELETE FROM detection_events WHERE id IN ("
                        "  SELECT id FROM detection_events"
                        "  WHERE detected_at < :cutoff"
                        "  LIMIT :batch)",
                        {"cutoff": de_cutoff},
                        "detection event(s)",
                    )
        except Exception as exc:
            logger.warning("Retention purge failed: %s", exc)
        await asyncio.sleep(settings.RETENTION_PURGE_INTERVAL_HOURS * 3600)


async def _cross_camera_dedup_loop():
    """Periodically reconcile duplicate visitors split across cameras."""
    interval = settings.CROSS_CAMERA_DEDUP_INTERVAL_MINUTES * 60
    if interval <= 0:
        return
    while True:
        await asyncio.sleep(interval)
        try:
            from app.services.cross_camera import reconcile_recent_duplicates
            async with AsyncSessionLocal() as db:
                result = await reconcile_recent_duplicates(db)
                if result.get("merged") or result.get("flagged"):
                    logger.info("Cross-camera reconcile: %s", result)
        except Exception as exc:
            logger.warning("Cross-camera reconcile failed: %s", exc)


def _spawn(coro):
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Restaurant Tracker — initializing database...")
    await init_db()

    import torch
    cpu_threads = int(os.environ.get("OMP_NUM_THREADS", "1"))
    torch.set_num_threads(cpu_threads)
    logger.info("PyTorch CPU thread count set to %d.", cpu_threads)

    # Honour device + model choices persisted from previous live switches (if any),
    # otherwise fall back to the configured values. Loading these BEFORE load_all so
    # a model swapped from the dashboard survives a restart.
    device = settings.DEVICE
    try:
        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    text(
                        "SELECT key, value FROM runtime_settings "
                        "WHERE key IN ('DEVICE', 'YOLO_MODEL_PATH', 'INSIGHTFACE_MODEL_NAME')"
                    )
                )
            ).all()
            persisted = {r.key: r.value for r in rows if r.value}
            if persisted.get("DEVICE"):
                device = persisted["DEVICE"]
                object.__setattr__(settings, "DEVICE", device)
            if persisted.get("YOLO_MODEL_PATH"):
                object.__setattr__(settings, "YOLO_MODEL_PATH", persisted["YOLO_MODEL_PATH"])
            if persisted.get("INSIGHTFACE_MODEL_NAME"):
                object.__setattr__(
                    settings, "INSIGHTFACE_MODEL_NAME", persisted["INSIGHTFACE_MODEL_NAME"]
                )
    except Exception:
        pass  # runtime_settings table may not exist yet

    logger.info(
        "Loading ML models (device=%s, yolo=%s, insightface=%s)...",
        device, settings.YOLO_MODEL_PATH, settings.INSIGHTFACE_MODEL_NAME,
    )
    ModelManager.get_instance().load_all(
        yolo_path=settings.YOLO_MODEL_PATH,
        insightface_name=settings.INSIGHTFACE_MODEL_NAME,
        device=device,
    )

    # Recover any visits left open by a previous run.
    async with AsyncSessionLocal() as db:
        await VisitTracker.get_instance().recover_active(db)
        await GateVisitTracker.get_instance().recover_open(db)

    _spawn(_stale_visit_loop())
    _spawn(_retention_loop())

    if settings.AUTO_TUNING_ENABLED:
        _spawn(_auto_tuning_loop())

    if settings.CROSS_CAMERA_ENABLED:
        _spawn(_cross_camera_dedup_loop())

    # Load persisted runtime settings from DB (migration 005) if table exists
    try:
        from app.api.admin_config import _PATCHABLE
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(text("SELECT key, value FROM runtime_settings"))).all()
            for row in rows:
                if row.key in _PATCHABLE:
                    try:
                        expected_type = type(getattr(settings, row.key))
                        object.__setattr__(settings, row.key, expected_type(row.value))
                    except Exception:
                        pass
            if rows:
                logger.info("Loaded %d runtime setting(s) from DB.", len(rows))
    except Exception:
        pass  # runtime_settings table may not exist yet

    # Start monitoring background loop
    from app.monitoring import monitoring_loop
    _spawn(monitoring_loop(get_db))

    if settings.CAMERA_AUTOSTART:
        manager = CameraManager.get_instance()
        cameras = parse_cameras_config(settings.CAMERAS)
        if not cameras:
            # Single-camera fallback (legacy CAMERA_SOURCE/CAMERA_ID).
            cameras = [(settings.CAMERA_ID, settings.CAMERA_SOURCE)]
        for cid, source in cameras:
            # Isolate failures so one bad source (e.g. an RTSP camera that's
            # offline) doesn't stop the others from starting.
            try:
                await manager.start(source=source, camera_id=cid)
                logger.info("Autostarted camera '%s' (source=%s).", cid, source)
            except Exception as exc:
                logger.warning("Camera autostart failed for '%s': %s", cid, exc)

    logger.info("Startup complete.")
    yield

    logger.info("Shutting down...")
    await CameraManager.get_instance().stop_all()
    for task in list(_background_tasks):
        task.cancel()
    await engine.dispose()


app = FastAPI(
    title="Restaurant Visitor Tracker",
    description="Auto-registering visitor detection, recognition, and analytics.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — scoped to the configured dashboard origin(s). Browsers do not apply CORS
# to WebSocket upgrades, so this middleware does not affect the /ws/live-feed
# handshake (enforce WS origin checks in the endpoint itself if needed). Never use
# allow_origins=["*"] together with allow_credentials=True — it is rejected by
# browsers and would silently disable credentialed requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms"],
)


@app.middleware("http")
async def add_timing(request, call_next):
    start = perf_counter()
    response = await call_next(request)
    elapsed_ms = (perf_counter() - start) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response


# ── Routers ──────────────────────────────────────────────────
from app.api import (  # noqa: E402
    activity,
    admin,
    admin_config,
    analytics,
    camera,
    detect,
    perf,
    settings as settings_api,
    visitors,
    websocket,
)

app.include_router(detect.router)
app.include_router(visitors.router)
app.include_router(analytics.router)
app.include_router(activity.router)
app.include_router(camera.router)
app.include_router(admin.router)
app.include_router(admin_config.router)
app.include_router(settings_api.router)
app.include_router(perf.router)
app.include_router(websocket.router)


@app.get("/api/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    model_mgr = ModelManager.get_instance()
    status = model_mgr.status()

    db_status = "connected"
    visitors_count = 0
    total_visits = 0
    try:
        await db.execute(text("SELECT 1"))
        visitors_count = await db.scalar(select(func.count(Visitor.id))) or 0
        total_visits = await db.scalar(select(func.count(Visit.id))) or 0
    except Exception:
        db_status = "error"

    healthy = db_status == "connected" and model_mgr.is_loaded
    return HealthResponse(
        status="ok" if healthy else "degraded",
        database=db_status,
        models_loaded=model_mgr.is_loaded,
        yolo_loaded=status["yolo_loaded"],
        arcface_loaded=status["arcface_loaded"],
        camera_running=CameraManager.get_instance().any_running(),
        visitors_count=visitors_count,
        total_visits=total_visits,
    )
