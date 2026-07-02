"""
Pipeline stage profiler — answers "where does the CPU time go?".

Each heavy stage of the CV pipeline (frame capture, YOLO person detection,
ArcFace face embedding, the per-person face fallback, identity resolution + DB
writes, and JPEG preview encoding) calls ``profiler.record(stage, seconds)``
once per invocation. The profiler keeps cheap rolling counters per
(camera, stage): call count, cumulative time, and an exponential moving average
of per-call latency.

The two numbers that matter for CPU attribution:

* **share** — a stage's cumulative time as a fraction of ALL stage time. This is
  the direct answer to "which stage eats the CPU": on CPU-only inference YOLO +
  ArcFace usually dominate.
* **occupancy** — a stage's cumulative time divided by wall-clock elapsed. With
  N cameras running in parallel threads the occupancies sum can exceed 1.0
  (i.e. it's using more than one core's worth of time), which is exactly what
  saturates an i9 with two cameras.

Everything here is process-local and reset-able. Recording is done from worker
threads (inference runs in a threadpool), so access is guarded by a lock.
"""

import threading
from time import perf_counter
from typing import Optional

# Human-readable labels + ordering for the known stages. Unknown stages still
# get recorded (they just won't have a friendly label / fixed order).
STAGE_LABELS: dict[str, str] = {
    "read": "Frame read (I/O wait)",
    "capture": "Frame resize",
    "yolo": "YOLO person detection",
    "arcface": "ArcFace face recognition",
    "face_fallback": "Per-person face fallback",
    "identity_db": "Identity match + DB write",
    "encode": "Live preview JPEG encode",
}
STAGE_ORDER = list(STAGE_LABELS.keys())

_EMA_ALPHA = 0.2  # weight of the newest sample in the moving average


class _StageStat:
    __slots__ = ("count", "total_s", "ema_ms", "last_ms")

    def __init__(self) -> None:
        self.count = 0
        self.total_s = 0.0
        self.ema_ms = 0.0
        self.last_ms = 0.0

    def add(self, seconds: float) -> None:
        ms = seconds * 1000.0
        self.count += 1
        self.total_s += seconds
        self.last_ms = ms
        self.ema_ms = ms if self.count == 1 else (
            _EMA_ALPHA * ms + (1 - _EMA_ALPHA) * self.ema_ms
        )


class PipelineProfiler:
    """Process-wide singleton collecting per-(camera, stage) timing."""

    _instance: Optional["PipelineProfiler"] = None

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # {camera_id: {stage: _StageStat}}
        self._stats: dict[str, dict[str, _StageStat]] = {}
        self._started_at = perf_counter()

    @classmethod
    def get_instance(cls) -> "PipelineProfiler":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def record(self, stage: str, seconds: float, camera_id: Optional[str] = None) -> None:
        """Log one timed invocation of ``stage`` (seconds) for ``camera_id``."""
        if seconds < 0:
            return
        cam = camera_id or "unknown"
        with self._lock:
            cam_stats = self._stats.setdefault(cam, {})
            stat = cam_stats.get(stage)
            if stat is None:
                stat = cam_stats[stage] = _StageStat()
            stat.add(seconds)

    def reset(self) -> None:
        with self._lock:
            self._stats.clear()
            self._started_at = perf_counter()

    def snapshot(self) -> dict:
        """Aggregated view: overall stage breakdown + per-camera breakdown."""
        with self._lock:
            elapsed = max(1e-6, perf_counter() - self._started_at)
            # Deep-ish copy of the numbers we need while holding the lock.
            cams = {
                cam: {st: (s.count, s.total_s, s.ema_ms, s.last_ms) for st, s in stages.items()}
                for cam, stages in self._stats.items()
            }

        # Aggregate across cameras for the "overall" breakdown.
        agg: dict[str, list[float]] = {}  # stage -> [count, total_s, ema_ms_sum, n_cams]
        for stages in cams.values():
            for st, (count, total_s, ema_ms, _last) in stages.items():
                acc = agg.setdefault(st, [0.0, 0.0, 0.0, 0.0])
                acc[0] += count
                acc[1] += total_s
                acc[2] += ema_ms
                acc[3] += 1

        grand_total = sum(v[1] for v in agg.values()) or 1e-9

        def _stage_rows(entries: dict) -> list[dict]:
            total = sum(e[1] for e in entries.values()) or 1e-9
            rows = []
            for st, e in entries.items():
                count = e[0]
                total_s = e[1]
                # e = [count, total_s, ema_ms_sum, n_sources]; average the EMAs.
                avg_ms = (e[2] / e[3]) if e[3] else 0.0
                rows.append({
                    "stage": st,
                    "label": STAGE_LABELS.get(st, st),
                    "calls": int(count),
                    "total_s": round(total_s, 3),
                    "avg_ms": round(avg_ms, 2),
                    "share_pct": round(100.0 * total_s / total, 1),
                    "occupancy_pct": round(100.0 * total_s / elapsed, 1),
                })
            rows.sort(key=lambda r: (
                STAGE_ORDER.index(r["stage"]) if r["stage"] in STAGE_ORDER else 999
            ))
            return rows

        overall = _stage_rows(agg)

        camera_rows = []
        for cam, stages in cams.items():
            # entries shaped like agg for _stage_rows: [count, total_s, ema_ms, 1]
            entries = {
                st: [count, total_s, ema_ms, 1.0]
                for st, (count, total_s, ema_ms, _last) in stages.items()
            }
            cam_total = sum(v[1] for v in entries.values())
            camera_rows.append({
                "camera_id": cam,
                "total_s": round(cam_total, 3),
                "occupancy_pct": round(100.0 * cam_total / elapsed, 1),
                "stages": _stage_rows(entries),
            })
        camera_rows.sort(key=lambda c: c["total_s"], reverse=True)

        return {
            "elapsed_s": round(elapsed, 1),
            "grand_total_s": round(grand_total, 3),
            "overall": overall,
            "cameras": camera_rows,
        }


profiler = PipelineProfiler.get_instance()
