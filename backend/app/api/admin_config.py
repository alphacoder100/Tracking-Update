"""
Runtime configuration API — change thresholds without restarting the server.

PATCH /api/admin/settings  →  update one or more settings fields in-process.
GET  /api/admin/settings   →  read current runtime values.

Changes are ephemeral (lost on restart) unless your deployment loads them from
a DB-backed runtime_settings table (see migration 005). For now the endpoint
mutates the in-process `settings` object so every subsequent request sees the
new value immediately.
"""

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Security, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import verify_admin_api_key
from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-config"])

# Fields that may be changed at runtime (whitelist for safety)
_PATCHABLE = {
    "RETURNING_FACE_THRESHOLD",
    "REJECT_SIMILARITY",
    "AMBIGUITY_MARGIN",
    "STRONG_MATCH_THRESHOLD",
    "NEW_VISITOR_MAX_SIMILARITY",
    "VISIT_COOLDOWN_MINUTES",
    "SEATED_COOLDOWN_MINUTES",
    "MAX_VISIT_DURATION_HOURS",
    "TEMPORAL_WINDOW_SECONDS",
    "TEMPORAL_MAX_PIXEL_DISTANCE",
    "TEMPORAL_MIN_SIMILARITY",
    "FACE_PREPROCESSING_CLAHE",
    "FACE_PREPROCESSING_GAMMA",
    "CLAHE_CLIP_LIMIT",
    "POSE_AWARE_GALLERY",
    "MASK_DETECTION_ENABLED",
    "MASKED_FACE_THRESHOLD_OFFSET",
    "AUTO_TUNING_ENABLED",
    "YOLO_PERSON_CONFIDENCE",
    "MIN_FACE_DET_SCORE",
    "FACE_QUALITY_CUTOFF",
    # Max face embeddings kept per visitor. Higher = more multi-pose data per
    # person (better recall) + larger gallery; merges only trim faces ABOVE this.
    "MAX_FACES_PER_VISITOR",
    # ── Multi-angle identity (Phase 3) ──
    "POSE_CONTINUOUS_SEARCH",
    "ADAPTIVE_VISITOR_THRESHOLDS",
    "IDENTITY_TOP_K",
    "GREY_ZONE_POLICY",
    "TRACKLET_ENABLED",
    "TRACKLET_WINDOW_SECONDS",
    "TRACKLET_MAX_PIXEL_DISTANCE",
    "TRACKLET_MIN_OBSERVATIONS_NEW",
    # ── Cross-camera identity (Phase 4) ──
    # NOTE: toggling CROSS_CAMERA_ENABLED live enables the per-detection candidate
    # check immediately; the background reconciliation loop is only (re)started on
    # app startup. FACE_CACHE_* and CROSS_CAMERA_DEDUP_INTERVAL_MINUTES are
    # intentionally NOT patchable (they change cache/loop structure → need restart).
    "CROSS_CAMERA_ENABLED",
    "CROSS_CAMERA_LOOKBACK_SECONDS",
    "CROSS_CAMERA_REVIEW_THRESHOLD",
    "CROSS_CAMERA_AUTO_THRESHOLD",
    "CROSS_CAMERA_AUTO_MERGE_THRESHOLD",
    # ── Entry/Exit gate counting (two-camera directional visits) ──
    # ENTRY_CAMERA_ID / EXIT_CAMERA_ID are free-form camera ids (set from the
    # dashboard Gate card), so they're patchable strings with no fixed enum.
    "GATE_COUNTING_ENABLED",
    "ENTRY_CAMERA_ID",
    "EXIT_CAMERA_ID",
    "GATE_MIN_DWELL_SECONDS",
    "GATE_MAX_DWELL_SECONDS",
    "GATE_REQUIRE_ENTRY_FIRST",
}

# String-enum settings: restrict patch values to a known set.
_ENUM_CHOICES: Dict[str, set] = {
    "GREY_ZONE_POLICY": {"review", "tracklet", "register"},
}


class SettingsPatch(BaseModel):
    updates: Dict[str, Any]

    @model_validator(mode="after")
    def check_keys(self) -> "SettingsPatch":
        bad = set(self.updates) - _PATCHABLE
        if bad:
            raise ValueError(f"Non-patchable or unknown keys: {sorted(bad)}")
        for key, choices in _ENUM_CHOICES.items():
            if key in self.updates and self.updates[key] not in choices:
                raise ValueError(
                    f"{key} must be one of {sorted(choices)}; got {self.updates[key]!r}"
                )
        # Entry and exit cameras must differ when both are provided in the patch.
        # Compared case-insensitively because camera ids resolve case-insensitively
        # (CameraManager registry key / gate role matching), so "CAM-01" and
        # "cam-01" are the same camera and can't be both entry and exit.
        entry = self.updates.get("ENTRY_CAMERA_ID")
        exit_ = self.updates.get("EXIT_CAMERA_ID")
        if entry and exit_ and str(entry).strip().lower() == str(exit_).strip().lower():
            raise ValueError("ENTRY_CAMERA_ID and EXIT_CAMERA_ID must differ.")
        return self


@router.get("/settings")
async def get_settings(_key: str = Security(verify_admin_api_key)):
    """Return current runtime values for all patchable settings."""
    return {k: getattr(settings, k, None) for k in sorted(_PATCHABLE)}


@router.patch("/settings")
async def patch_settings(
    body: SettingsPatch,
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_admin_api_key),
):
    """Update one or more runtime settings in-process (survives until next restart)."""
    applied: Dict[str, Any] = {}
    errors: Dict[str, str] = {}

    for key, value in body.updates.items():
        try:
            expected_type = type(getattr(settings, key))
            cast_value = expected_type(value)
            object.__setattr__(settings, key, cast_value)
            applied[key] = cast_value

            # Persist to runtime_settings table if it exists (migration 005)
            try:
                await db.execute(
                    text("""
                        INSERT INTO runtime_settings (key, value, updated_at)
                        VALUES (:key, :value, NOW())
                        ON CONFLICT (key) DO UPDATE
                          SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                    """),
                    {"key": key, "value": str(cast_value)},
                )
            except Exception:
                pass  # Table may not exist yet — not critical

        except Exception as exc:
            errors[key] = str(exc)
            logger.warning("Failed to apply setting %s=%r: %s", key, value, exc)

    if applied:
        logger.info("Runtime settings updated: %s", applied)
        await db.commit()

    return {"applied": applied, "errors": errors}


# ── Processing device (CPU / GPU) ────────────────────────────

_DEVICE_CHOICES = {"auto", "cpu", "cuda"}


class DevicePatch(BaseModel):
    device: str

    @field_validator("device")
    @classmethod
    def check_device(cls, v: str) -> str:
        norm = (v or "").strip().lower()
        if norm == "gpu":
            norm = "cuda"
        if norm not in _DEVICE_CHOICES:
            raise ValueError(f"device must be one of {sorted(_DEVICE_CHOICES)}")
        return norm


def _device_status() -> Dict[str, Any]:
    """Current device state + GPU capability for the dashboard."""
    from app.ml_models import ModelManager, cuda_available, gpu_info

    mgr = ModelManager.get_instance()
    info = gpu_info()
    return {
        "requested": getattr(settings, "DEVICE", "auto"),
        "current_device": mgr.device,
        "cuda_available": cuda_available(),
        "gpu_name": info.get("name"),
        "gpu_memory_mb": info.get("memory_mb"),
        "gpu_memory_used_mb": info.get("memory_used_mb"),
        "models_loaded": mgr.is_loaded,
    }


@router.get("/device")
async def get_device(_key: str = Security(verify_admin_api_key)):
    """Report the active processing device and whether a CUDA GPU is usable."""
    return _device_status()


@router.post("/device")
async def set_device(
    body: DevicePatch,
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_admin_api_key),
):
    """
    Switch processing between CPU and GPU live — reloads all models onto the new
    device in-process. Inference is paused for the duration of the reload.
    """
    from app.ml_models import ModelManager, resolve_device
    from app.utils import _get_inference_semaphore

    requested = body.device
    resolved = resolve_device(requested)

    # Pause inference (camera loop / requests) while models are swapped. With
    # INFERENCE_MAX_CONCURRENCY=1 this fully serializes against in-flight work.
    semaphore = _get_inference_semaphore()
    async with semaphore:
        try:
            await run_in_threadpool(ModelManager.get_instance().reload, resolved)
        except Exception as exc:
            logger.exception("Device reload failed (%s): %s", resolved, exc)
            raise HTTPException(
                status_code=500, detail=f"Failed to switch device: {exc}"
            )

    # Remember the user's REQUESTED choice (e.g. "auto"), not the resolved value.
    object.__setattr__(settings, "DEVICE", requested)
    try:
        await db.execute(
            text("""
                INSERT INTO runtime_settings (key, value, updated_at)
                VALUES ('DEVICE', :value, NOW())
                ON CONFLICT (key) DO UPDATE
                  SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            """),
            {"value": requested},
        )
        await db.commit()
    except Exception:
        pass  # runtime_settings table may not exist yet — not critical

    logger.info("Processing device switched to %s (requested=%s).", resolved, requested)
    return _device_status()


# ── Model selection (detector / recognition) ─────────────────
#
# Swap the person-detection (YOLO) and/or face-recognition (InsightFace) models
# live — reloads in-process onto the current device (no restart). YOLO weights
# auto-download via Ultralytics; InsightFace packs via the model zoo.
#
# IMPORTANT: all buffalo_* and antelopev2 packs emit 512-d embeddings, so swapping
# among them does NOT break the Vector(512) gallery column. But each recognition
# model lives in its OWN embedding space, so existing gallery vectors stop matching
# the new model — returning-visitor recognition is degraded until the gallery is
# re-enrolled. The POST therefore refuses a recognition-model change unless the
# caller passes confirm_recognition_change=true.

_KNOWN_YOLO = [
    "yolov8n.pt", "yolov8s.pt", "yolov8m.pt", "yolov8l.pt",
    "yolo11n.pt", "yolo11s.pt", "yolo11m.pt",
]
_KNOWN_INSIGHTFACE = ["buffalo_l", "buffalo_m", "buffalo_s", "buffalo_sc", "antelopev2"]
_KNOWN_ADAFACE = ["adaface"]
_KNOWN_RECOGNITION = _KNOWN_INSIGHTFACE + _KNOWN_ADAFACE


def _local_yolo_weights() -> List[str]:
    """*.pt files sitting in the backend working dir (operator-supplied weights)."""
    try:
        return sorted(p.name for p in Path(".").glob("*.pt"))
    except Exception:
        return []


def _yolo_choices() -> List[str]:
    return sorted(set(_KNOWN_YOLO) | set(_local_yolo_weights()))


async def _gallery_counts(db: AsyncSession) -> tuple[int, int]:
    """(visitor_count, gallery_face_count) — used for the rebuild warning."""
    try:
        v = (await db.execute(text("SELECT COUNT(*) FROM visitors"))).scalar() or 0
        f = (await db.execute(text("SELECT COUNT(*) FROM visitor_faces"))).scalar() or 0
        return int(v), int(f)
    except Exception:
        return 0, 0


async def _models_payload(db: AsyncSession) -> Dict[str, Any]:
    from app.ml_models import ModelManager

    mgr = ModelManager.get_instance()
    visitors, faces = await _gallery_counts(db)
    return {
        "yolo_model": settings.YOLO_MODEL_PATH,
        "insightface_model": settings.INSIGHTFACE_MODEL_NAME,
        "yolo_options": _yolo_choices(),
        "insightface_options": _KNOWN_RECOGNITION,
        "device": mgr.device,
        "models_loaded": mgr.is_loaded,
        "gallery_visitor_count": visitors,
        "gallery_face_count": faces,
    }


async def _persist_runtime(db: AsyncSession, values: Dict[str, str]) -> None:
    """Best-effort upsert of key/value pairs into runtime_settings."""
    for key, value in values.items():
        try:
            await db.execute(
                text("""
                    INSERT INTO runtime_settings (key, value, updated_at)
                    VALUES (:key, :value, NOW())
                    ON CONFLICT (key) DO UPDATE
                      SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                """),
                {"key": key, "value": value},
            )
        except Exception:
            pass  # table may not exist yet — not critical
    try:
        await db.commit()
    except Exception:
        pass


class ModelPatch(BaseModel):
    yolo_model: Optional[str] = None
    insightface_model: Optional[str] = None
    confirm_recognition_change: bool = False

    @model_validator(mode="after")
    def check(self) -> "ModelPatch":
        if self.yolo_model is None and self.insightface_model is None:
            raise ValueError("Provide yolo_model and/or insightface_model.")
        if (
            self.insightface_model is not None
            and self.insightface_model not in _KNOWN_RECOGNITION
        ):
            raise ValueError(
                f"insightface_model must be one of {_KNOWN_RECOGNITION}"
            )
        return self


@router.get("/models")
async def get_models(
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_admin_api_key),
):
    """Current detector / recognition models, available choices, and gallery size."""
    return await _models_payload(db)


@router.post("/models")
async def set_models(
    body: ModelPatch,
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_admin_api_key),
):
    """Swap the detector and/or recognition model live (reloads in-process)."""
    from app.ml_models import ModelManager, resolve_device
    from app.utils import _get_inference_semaphore

    new_yolo = settings.YOLO_MODEL_PATH
    new_face = settings.INSIGHTFACE_MODEL_NAME

    if body.yolo_model is not None:
        if body.yolo_model not in set(_yolo_choices()):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown yolo_model '{body.yolo_model}'. Choose one of "
                    f"{_yolo_choices()} or drop the .pt file in the backend dir."
                ),
            )
        new_yolo = body.yolo_model

    recognition_changing = (
        body.insightface_model is not None
        and body.insightface_model != settings.INSIGHTFACE_MODEL_NAME
    )
    if recognition_changing and not body.confirm_recognition_change:
        _, faces = await _gallery_counts(db)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Switching the recognition model to '{body.insightface_model}' makes the "
                f"existing {faces} gallery embedding(s) incompatible — they live in the "
                f"current model's embedding space, so returning visitors will not match "
                f"until the gallery is rebuilt/re-enrolled. Resend with "
                f"confirm_recognition_change=true to proceed."
            ),
        )
    if body.insightface_model is not None:
        new_face = body.insightface_model

    semaphore = _get_inference_semaphore()
    resolved = resolve_device(settings.DEVICE)
    async with semaphore:
        try:
            await run_in_threadpool(
                ModelManager.get_instance().reload, resolved, new_yolo, new_face
            )
        except Exception as exc:
            logger.exception("Model reload failed (yolo=%s, face=%s): %s", new_yolo, new_face, exc)
            raise HTTPException(status_code=500, detail=f"Failed to reload models: {exc}")

    object.__setattr__(settings, "YOLO_MODEL_PATH", new_yolo)
    object.__setattr__(settings, "INSIGHTFACE_MODEL_NAME", new_face)
    await _persist_runtime(
        db,
        {"YOLO_MODEL_PATH": new_yolo, "INSIGHTFACE_MODEL_NAME": new_face},
    )
    logger.info("Models switched: yolo=%s, insightface=%s", new_yolo, new_face)
    return await _models_payload(db)


# ── Saved benchmark reports (from `python -m benchmark ...`) ──

_BENCH_DIR = Path("storage/benchmarks")


@router.get("/benchmarks")
async def list_benchmarks(_key: str = Security(verify_admin_api_key)):
    """List saved benchmark runs (newest first) with a light summary."""
    if not _BENCH_DIR.is_dir():
        return []
    out: List[dict] = []
    for p in sorted(_BENCH_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        out.append({
            "name": p.stem,
            "kind": data.get("kind"),
            "generated_at": data.get("generated_at"),
            "meta": data.get("meta", {}),
            "model_count": len(data.get("results", [])),
        })
    return out


class BenchmarkRunRequest(BaseModel):
    kind: str = "recognition"
    models: List[str]
    align: str = "resize"           # resize (fast, fair A/B) | detect (realistic)
    device: str = "cpu"             # cpu keeps the live GPU free during eval

    @model_validator(mode="after")
    def check(self) -> "BenchmarkRunRequest":
        if self.kind != "recognition":
            # Detection accuracy needs labelled frames, which live data lacks; only
            # recognition can be scored against the accumulated gallery crops.
            raise ValueError("Only kind='recognition' can be evaluated on live data.")
        if not self.models:
            raise ValueError("Provide at least one model to evaluate.")
        bad = [m for m in self.models if m not in _KNOWN_RECOGNITION]
        if bad:
            raise ValueError(f"Unknown recognition model(s): {bad}")
        if self.align not in ("resize", "detect"):
            raise ValueError("align must be 'resize' or 'detect'.")
        if self.device not in ("cpu", "cuda", "auto"):
            raise ValueError("device must be 'cpu', 'cuda' or 'auto'.")
        return self


@router.post("/benchmarks/run")
async def run_benchmark(
    body: BenchmarkRunRequest,
    _key: str = Security(verify_admin_api_key),
):
    """Evaluate one or more recognition models on the live gallery (subprocess)."""
    from app.services.benchmark_runner import BenchmarkRunner

    runner = BenchmarkRunner.get_instance()
    try:
        await runner.start(body.kind, body.models, body.align, body.device)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return runner.status()


@router.get("/benchmarks/run")
async def benchmark_run_status(_key: str = Security(verify_admin_api_key)):
    """Current benchmark-run status + rolling log tail (poll while running)."""
    from app.services.benchmark_runner import BenchmarkRunner

    return BenchmarkRunner.get_instance().status()


@router.get("/benchmarks/leaderboard")
async def benchmark_leaderboard(
    kind: str = "recognition",
    _key: str = Security(verify_admin_api_key),
):
    """Best-scoring result PER MODEL across all saved reports, ranked, with the
    currently-active model and the winner flagged."""
    rank_key = "auc" if kind == "recognition" else "ap50"
    best_per_model: Dict[str, dict] = {}
    if _BENCH_DIR.is_dir():
        for p in sorted(_BENCH_DIR.glob(f"{kind}-*.json")):
            try:
                data = json.loads(p.read_text())
            except Exception:
                continue
            for r in data.get("results", []):
                model = r.get("model")
                score = r.get(rank_key)
                if model is None or score is None:
                    continue
                prev = best_per_model.get(model)
                if prev is None or score > prev["_score"]:
                    best_per_model[model] = {
                        **r,
                        "_score": score,
                        "source_report": p.stem,
                        "generated_at": data.get("generated_at"),
                        "align": (data.get("meta", {}) or {}).get("align"),
                    }

    active = (
        settings.INSIGHTFACE_MODEL_NAME
        if kind == "recognition"
        else settings.YOLO_MODEL_PATH
    )
    rows = sorted(best_per_model.values(), key=lambda r: r["_score"], reverse=True)
    best = rows[0]["model"] if rows else None
    for r in rows:
        r["is_active"] = r["model"] == active
        r["is_best"] = r["model"] == best
        r.pop("_score", None)

    options = _KNOWN_RECOGNITION if kind == "recognition" else _yolo_choices()
    return {
        "kind": kind,
        "active_model": active,
        "best_model": best,
        "models": rows,
        "all_candidates": options,
    }


# ── Video benchmark (upload a clip → score all models on it) ──
#
# Runs detection + recognition models on the frames of an uploaded video, on CPU
# and/or GPU, recording speed + resource cost + self-consistency quality. Heavy and
# multi-pass, so it runs in an isolated subprocess (the live model is untouched).

_VIDEO_BENCH_DIR = Path("storage") / "benchmark_videos"
_VALID_DEVICES = {"cpu", "cuda"}


@router.post("/benchmarks/video/run")
async def run_video_benchmark(
    file: UploadFile = File(...),
    detection_models: str = Form(""),
    recognition_models: str = Form(""),
    devices: str = Form("cpu"),
    max_frames: int = Form(150),
    run_pipeline: bool = Form(True),
    _key: str = Security(verify_admin_api_key),
):
    """Upload a video and benchmark detection + recognition models on it."""
    from app.services.video_benchmark_runner import VideoBenchmarkRunner
    from app.utils import is_video_upload

    runner = VideoBenchmarkRunner.get_instance()
    if runner.is_running:
        raise HTTPException(status_code=409, detail="A video benchmark is already running.")

    if not is_video_upload(file.filename, file.content_type):
        raise HTTPException(status_code=400, detail="File does not look like a video.")

    # Parse + validate model lists and devices.
    det = [m.strip() for m in detection_models.split(",") if m.strip()]
    rec = [m.strip() for m in recognition_models.split(",") if m.strip()]
    devs = [d.strip().lower() for d in devices.split(",") if d.strip()]
    devs = ["cuda" if d == "gpu" else d for d in devs]

    if not det and not rec:
        raise HTTPException(status_code=400, detail="Select at least one detection or recognition model.")
    bad_yolo = [m for m in det if m not in set(_yolo_choices())]
    if bad_yolo:
        raise HTTPException(status_code=400, detail=f"Unknown detection model(s): {bad_yolo}")
    bad_rec = [m for m in rec if m not in _KNOWN_RECOGNITION]
    if bad_rec:
        raise HTTPException(status_code=400, detail=f"Unknown recognition model(s): {bad_rec}")
    bad_dev = [d for d in devs if d not in _VALID_DEVICES]
    if bad_dev:
        raise HTTPException(status_code=400, detail=f"Devices must be cpu/cuda; got {bad_dev}")
    if not devs:
        devs = ["cpu"]

    # Drop cuda if no GPU is actually present, so the run doesn't silently fall back.
    from app.ml_models import cuda_available
    if "cuda" in devs and not cuda_available():
        devs = [d for d in devs if d != "cuda"] or ["cpu"]

    max_frames = max(10, min(int(max_frames), 600))

    # Persist the upload.
    contents = await file.read()
    max_bytes = settings.VIDEO_MAX_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Video exceeds the {settings.VIDEO_MAX_SIZE_MB} MB limit.")
    _VIDEO_BENCH_DIR.mkdir(parents=True, exist_ok=True)
    suffix = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix, dir=str(_VIDEO_BENCH_DIR))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save upload: {exc}")

    try:
        await runner.start(path, det, rec, devs, max_frames=max_frames, run_pipeline=run_pipeline)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return runner.status()


@router.get("/benchmarks/video/run")
async def video_benchmark_status(_key: str = Security(verify_admin_api_key)):
    """Current video-benchmark run status + rolling log tail (poll while running)."""
    from app.services.video_benchmark_runner import VideoBenchmarkRunner

    return VideoBenchmarkRunner.get_instance().status()


@router.get("/benchmarks/video/options")
async def video_benchmark_options(_key: str = Security(verify_admin_api_key)):
    """Available models + device capability for the video-benchmark UI."""
    from app.ml_models import cuda_available
    from benchmark.resources import gpu_name

    return {
        "detection_models": _yolo_choices(),
        "recognition_models": _KNOWN_RECOGNITION,
        "active_yolo": settings.YOLO_MODEL_PATH,
        "active_recognition": settings.INSIGHTFACE_MODEL_NAME,
        "cuda_available": cuda_available(),
        "gpu_name": gpu_name() if cuda_available() else None,
    }


@router.get("/benchmarks/{name}")
async def get_benchmark(name: str, _key: str = Security(verify_admin_api_key)):
    """Return one saved benchmark report by name (full JSON)."""
    safe = Path(name).name  # strip any path components — no traversal
    p = _BENCH_DIR / f"{safe}.json"
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Benchmark not found.")
    try:
        return json.loads(p.read_text())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read benchmark: {exc}")


@router.get("/review-queue")
async def get_review_queue(
    limit: int = 50,
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Return unresolved human-review flags."""
    from app.services.review_queue import get_pending_flags
    return await get_pending_flags(db, limit=limit)


@router.post("/review-queue/auto-merge-duplicates")
async def auto_merge_review_duplicates(
    min_similarity: Optional[float] = Query(
        None, ge=0.0, le=1.0,
        description="Only merge duplicate flags with similarity >= this "
                    "(defaults to AUTO_MERGE_MIN_SIMILARITY).",
    ),
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Merge probable-duplicate flags above a confidence floor into their matched
    visitor (global dedup). Weaker pairs are left for human review."""
    from app.services.review_queue import auto_merge_duplicates
    return await auto_merge_duplicates(db, min_similarity=min_similarity)


@router.post("/review-queue/{flag_id}/resolve")
async def resolve_review_flag(
    flag_id: str,
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a review flag. For a probable-duplicate it MERGES the flagged
    visitor into the existing one it matched (collapsing the pair into one user);
    every other flag type is simply marked resolved."""
    import uuid
    from app.services.review_queue import resolve_flag_with_merge
    result = await resolve_flag_with_merge(db, uuid.UUID(flag_id))
    return {"success": result["resolved"], "flag_id": flag_id, **result}


@router.post("/visitors/{visitor_id}/clean-faces")
async def clean_visitor_faces(
    visitor_id: str,
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Auto-remove unclear faces from a visitor's gallery (clarity-based pruning)."""
    import uuid
    from app.services.auto_enroller import clean_visitor_gallery
    return await clean_visitor_gallery(db, uuid.UUID(visitor_id))


# ── Camera topology (Phase 4 cross-camera) ───────────────────

class CameraTopologyUpsert(BaseModel):
    camera_a: str
    camera_b: str
    min_travel_seconds: Optional[float] = None
    max_expected_seconds: Optional[float] = None
    transition_enabled: bool = True

    @model_validator(mode="after")
    def check(self) -> "CameraTopologyUpsert":
        if not self.camera_a.strip() or not self.camera_b.strip():
            raise ValueError("camera_a and camera_b are required.")
        if self.camera_a.strip() == self.camera_b.strip():
            raise ValueError("camera_a and camera_b must differ.")
        return self


@router.get("/cameras")
async def list_known_cameras(
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Distinct camera ids seen in detections/visits, for topology dropdowns."""
    ids: set[str] = {settings.CAMERA_ID}
    for tbl in ("detection_events", "visits"):
        try:
            rows = (await db.execute(
                text(f"SELECT DISTINCT camera_id FROM {tbl} WHERE camera_id IS NOT NULL")
            )).all()
            ids.update(r.camera_id for r in rows if r.camera_id)
        except Exception:
            pass
    return sorted(ids)


@router.get("/camera-topology")
async def list_camera_topology(
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """List configured camera-transition constraints."""
    from app.models import CameraTopology
    from sqlalchemy import select

    try:
        rows = (await db.execute(select(CameraTopology))).scalars().all()
    except Exception:
        return []
    return [
        {
            "id": str(r.id),
            "camera_a": r.camera_a,
            "camera_b": r.camera_b,
            "min_travel_seconds": r.min_travel_seconds,
            "max_expected_seconds": r.max_expected_seconds,
            "transition_enabled": r.transition_enabled,
        }
        for r in rows
    ]


@router.post("/camera-topology")
async def upsert_camera_topology(
    body: CameraTopologyUpsert,
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Create or update a camera-pair transition constraint (unique by pair)."""
    import uuid
    from app.models import CameraTopology
    from sqlalchemy import select, or_, and_

    a, b = body.camera_a.strip(), body.camera_b.strip()
    existing = (
        await db.execute(
            select(CameraTopology).where(
                or_(
                    and_(CameraTopology.camera_a == a, CameraTopology.camera_b == b),
                    and_(CameraTopology.camera_a == b, CameraTopology.camera_b == a),
                )
            )
        )
    ).scalars().first()

    if existing is None:
        existing = CameraTopology(id=uuid.uuid4(), camera_a=a, camera_b=b)
        db.add(existing)
    existing.min_travel_seconds = body.min_travel_seconds
    existing.max_expected_seconds = body.max_expected_seconds
    existing.transition_enabled = body.transition_enabled
    await db.commit()
    return {"id": str(existing.id), "camera_a": a, "camera_b": b}


@router.delete("/camera-topology/{topology_id}")
async def delete_camera_topology(
    topology_id: str,
    _key: str = Security(verify_admin_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Delete a camera-transition constraint."""
    import uuid
    from app.models import CameraTopology

    obj = await db.get(CameraTopology, uuid.UUID(topology_id))
    if obj is not None:
        await db.delete(obj)
        await db.commit()
    return {"success": obj is not None, "id": topology_id}


@router.post("/settings/reload")
async def reload_settings_from_db(
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_admin_api_key),
):
    """Reload persisted settings from the runtime_settings table (if present)."""
    try:
        rows = (await db.execute(text("SELECT key, value FROM runtime_settings"))).all()
    except Exception:
        return {"reloaded": 0, "message": "runtime_settings table not found"}

    reloaded = 0
    for row in rows:
        key, value = row.key, row.value
        if key not in _PATCHABLE:
            continue
        try:
            expected_type = type(getattr(settings, key))
            object.__setattr__(settings, key, expected_type(value))
            reloaded += 1
        except Exception as exc:
            logger.warning("Could not reload %s=%r: %s", key, value, exc)

    logger.info("Reloaded %d runtime setting(s) from DB.", reloaded)
    return {"reloaded": reloaded}
