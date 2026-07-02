"""
UI-triggered VIDEO benchmark runner.

Runs `python -m benchmark video ...` as an isolated subprocess so candidate models
are loaded/evaluated on an uploaded video WITHOUT touching the live ModelManager
serving detections. A fresh subprocess also gives clean per-device (CPU vs CUDA)
resource readings.

Only one run executes at a time (model loading + multi-device passes are heavy).
Progress is a rolling log tail the dashboard polls; on success the produced report
lands in storage/benchmarks/video-*.json and is read back by the report endpoint.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_BENCH_DIR = _BACKEND_ROOT / "storage" / "benchmarks"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class VideoBenchmarkRunner:
    """Singleton managing at most one in-flight video-benchmark subprocess."""

    _instance: Optional["VideoBenchmarkRunner"] = None

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._log: deque[str] = deque(maxlen=200)
        self._state: Dict[str, Any] = self._idle_state()

    @staticmethod
    def _idle_state() -> Dict[str, Any]:
        return {
            "status": "idle",  # idle | running | done | error
            "video": None,
            "detection_models": [],
            "recognition_models": [],
            "devices": [],
            "started_at": None,
            "finished_at": None,
            "report": None,  # stem of the saved video-*.json
            "error": None,
        }

    @classmethod
    def get_instance(cls) -> "VideoBenchmarkRunner":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_running(self) -> bool:
        return self._state["status"] == "running"

    async def start(
        self,
        video_path: str,
        detection_models: List[str],
        recognition_models: List[str],
        devices: List[str],
        max_frames: int = 150,
        run_pipeline: bool = True,
    ) -> None:
        if self.is_running:
            raise RuntimeError("A video benchmark run is already in progress.")
        self._log.clear()
        self._state = {
            "status": "running",
            "video": Path(video_path).name,
            "detection_models": detection_models,
            "recognition_models": recognition_models,
            "devices": devices,
            "started_at": _now_iso(),
            "finished_at": None,
            "report": None,
            "error": None,
        }
        self._task = asyncio.create_task(
            self._run(video_path, detection_models, recognition_models, devices,
                      max_frames, run_pipeline)
        )

    async def _run(
        self,
        video_path: str,
        detection_models: List[str],
        recognition_models: List[str],
        devices: List[str],
        max_frames: int,
        run_pipeline: bool = True,
    ) -> None:
        _BENCH_DIR.mkdir(parents=True, exist_ok=True)
        args = [
            sys.executable, "-m", "benchmark", "video",
            "--video", video_path,
            "--detection-models", ",".join(detection_models),
            "--recognition-models", ",".join(recognition_models),
            "--devices", ",".join(devices),
            "--max-frames", str(max_frames),
            "--out", str(_BENCH_DIR),
        ]
        if not run_pipeline:
            args.append("--no-pipeline")
        started = time.time()
        logger.info("Video benchmark subprocess: %s", " ".join(args))
        try:
            rc = await asyncio.to_thread(self._stream_subprocess, args)
            if rc == 0:
                self._state["report"] = self._latest_report(started)
                self._state["status"] = "done"
            else:
                self._state["status"] = "error"
                self._state["error"] = f"benchmark exited with code {rc}"
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Video benchmark run failed: %s", exc)
            self._state["status"] = "error"
            self._state["error"] = str(exc)
        finally:
            self._state["finished_at"] = _now_iso()

    def _stream_subprocess(self, args: List[str]) -> int:
        proc = subprocess.Popen(
            args,
            cwd=str(_BACKEND_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=_subprocess_env(),
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        assert proc.stdout is not None
        with proc.stdout:
            for raw in proc.stdout:
                line = raw.rstrip()
                if line:
                    self._log.append(line)
        return proc.wait()

    def _latest_report(self, after_ts: float) -> Optional[str]:
        if not _BENCH_DIR.is_dir():
            return None
        candidates = [
            p for p in _BENCH_DIR.glob("video-*.json")
            if p.stat().st_mtime >= after_ts - 2
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p.stat().st_mtime).stem

    def status(self) -> Dict[str, Any]:
        return {**self._state, "log": list(self._log)}


def _subprocess_env() -> Dict[str, str]:
    import os

    env = dict(os.environ)
    env.setdefault("YOLO_AUTOINSTALL", "False")
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    return env
