"""
Performance / CPU-attribution API.

Powers the dashboard "Performance" page: overall + per-core CPU load, memory,
the active inference device, the thread-pool configuration that governs how many
cores inference can burn, and — the key piece — a per-stage breakdown of where
the pipeline actually spends its compute (YOLO vs ArcFace vs DB vs encode …).

Everything here is read-only sampling; the numbers come from ``psutil`` (system)
and the in-process ``PipelineProfiler`` (stage timing).
"""

import logging
import os

from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.profiling import profiler
from app.services.camera_manager import CameraManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/perf", tags=["performance"])


def _system_sample() -> dict:
    """Blocking psutil sample — always called via run_in_threadpool."""
    import psutil

    proc = psutil.Process()
    # interval=0.15 → a short real measurement window (vs the meaningless 0.0 that
    # returns usage since the last call, which may be seconds/minutes ago).
    per_core = psutil.cpu_percent(interval=0.15, percpu=True)
    overall = round(sum(per_core) / len(per_core), 1) if per_core else 0.0
    vm = psutil.virtual_memory()

    # Process-level CPU can exceed 100% (it's summed across cores).
    try:
        proc_cpu = proc.cpu_percent(interval=None)
    except Exception:
        proc_cpu = None
    try:
        proc_rss_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
        proc_threads = proc.num_threads()
    except Exception:
        proc_rss_mb, proc_threads = None, None

    try:
        load1, load5, load15 = os.getloadavg()  # not on Windows
        loadavg = [round(load1, 2), round(load5, 2), round(load15, 2)]
    except (OSError, AttributeError):
        loadavg = None

    return {
        "cpu_percent": overall,
        "per_core": [round(c, 1) for c in per_core],
        "cpu_count_logical": psutil.cpu_count(logical=True),
        "cpu_count_physical": psutil.cpu_count(logical=False),
        "loadavg": loadavg,
        "memory_percent": vm.percent,
        "memory_used_mb": round(vm.used / (1024 * 1024), 1),
        "memory_total_mb": round(vm.total / (1024 * 1024), 1),
        "process_cpu_percent": round(proc_cpu, 1) if proc_cpu is not None else None,
        "process_rss_mb": proc_rss_mb,
        "process_threads": proc_threads,
    }


def _device_and_threads() -> dict:
    """Active inference device + the knobs that decide how many cores it uses."""
    from app.ml_models import ModelManager, cuda_available

    mgr = ModelManager.get_instance()
    status = mgr.status()
    device = status.get("device", "cpu")

    torch_threads = None
    try:
        import torch

        torch_threads = torch.get_num_threads()
    except Exception:
        pass

    return {
        "device": device,
        "cuda_available": cuda_available(),
        "on_cpu": device == "cpu",
        "torch_threads": torch_threads,
        "omp_num_threads": os.environ.get("OMP_NUM_THREADS"),
        "inference_workers": settings.INFERENCE_WORKERS,
        "inference_max_concurrency": getattr(settings, "INFERENCE_MAX_CONCURRENCY", None),
        "pipeline_parallel": settings.PIPELINE_PARALLEL,
    }


@router.get("")
@router.get("/")
async def get_performance() -> dict:
    """System load + device config + pipeline stage compute breakdown."""
    system = await run_in_threadpool(_system_sample)
    device = _device_and_threads()
    stages = profiler.snapshot()

    # Fold live camera fps/frame stats into the profiler's per-camera rows so the
    # UI can show throughput next to the compute breakdown.
    status_by_id = {
        s["camera_id"].strip().lower(): s
        for s in CameraManager.get_instance().list_status()
    }
    for cam in stages["cameras"]:
        st = status_by_id.get(cam["camera_id"].strip().lower())
        if st:
            cam["is_running"] = st.get("is_running")
            cam["source_kind"] = st.get("source_kind")
            cam["frames_processed"] = st.get("frames_processed")
            cam["frames_skipped"] = st.get("frames_skipped")
            cam["uptime_seconds"] = st.get("uptime_seconds")

    return {"system": system, "device": device, **stages}


@router.post("/reset")
async def reset_performance() -> dict:
    """Zero the stage counters (e.g. after a config change) to re-measure."""
    profiler.reset()
    return {"ok": True}
