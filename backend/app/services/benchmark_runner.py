"""
UI-triggered benchmark runner.

Runs the `python -m benchmark` harness as an isolated **subprocess** so a candidate
model is loaded/evaluated WITHOUT touching the live ModelManager that is serving
detections. This keeps production recognition unaffected while you score
alternatives on your own accumulated gallery crops (storage/visitor_photos).

Only one run executes at a time (model loading is heavy). Progress is captured as
a rolling log tail the dashboard polls; on success the produced report lands in
storage/benchmarks/ and is picked up by the leaderboard endpoint.
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

# benchmark_runner.py → services → app → backend (the dir holding storage/ + benchmark/)
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_BENCH_DIR = _BACKEND_ROOT / "storage" / "benchmarks"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BenchmarkRunner:
    """Singleton managing at most one in-flight benchmark subprocess."""

    _instance: Optional["BenchmarkRunner"] = None

    def __init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._log: deque[str] = deque(maxlen=80)
        self._state: Dict[str, Any] = {
            "status": "idle",  # idle | running | done | error
            "kind": None,
            "models": [],
            "align": None,
            "device": None,
            "started_at": None,
            "finished_at": None,
            "report": None,
            "error": None,
        }

    @classmethod
    def get_instance(cls) -> "BenchmarkRunner":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_running(self) -> bool:
        return self._state["status"] == "running"

    async def start(
        self, kind: str, models: List[str], align: str, device: str
    ) -> None:
        if self.is_running:
            raise RuntimeError("A benchmark run is already in progress.")
        self._log.clear()
        self._state = {
            "status": "running",
            "kind": kind,
            "models": models,
            "align": align,
            "device": device,
            "started_at": _now_iso(),
            "finished_at": None,
            "report": None,
            "error": None,
        }
        self._task = asyncio.create_task(self._run(kind, models, align, device))

    async def _run(self, kind: str, models: List[str], align: str, device: str) -> None:
        _BENCH_DIR.mkdir(parents=True, exist_ok=True)
        args = [
            sys.executable, "-m", "benchmark", kind,
            "--models", ",".join(models),
            "--device", device,
            "--out", str(_BENCH_DIR),
        ]
        if kind == "recognition":
            args += ["--align", align]
        started = time.time()
        logger.info("Benchmark subprocess: %s", " ".join(args))
        try:
            # Run a blocking subprocess in a worker thread rather than
            # asyncio.create_subprocess_exec. Under `uvicorn --reload` (and any
            # --workers run) the app's event loop on Windows is a
            # SelectorEventLoop, which has no subprocess transport
            # (create_subprocess_exec -> NotImplementedError). Popen works under
            # any loop/policy and platform.
            rc = await asyncio.to_thread(self._stream_subprocess, args)
            if rc == 0:
                self._state["report"] = self._latest_report(kind, started)
                self._state["status"] = "done"
            else:
                self._state["status"] = "error"
                self._state["error"] = f"benchmark exited with code {rc}"
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Benchmark run failed: %s", exc)
            self._state["status"] = "error"
            self._state["error"] = str(exc)
        finally:
            self._state["finished_at"] = _now_iso()

    def _stream_subprocess(self, args: List[str]) -> int:
        """Run the benchmark subprocess to completion (blocking — call via a
        worker thread), tailing its merged stdout/stderr into the rolling log.
        Returns the process exit code. Safe to mutate `self._log` here: deque
        appends are atomic under the GIL and the status reader only snapshots it.
        """
        proc = subprocess.Popen(
            args,
            cwd=str(_BACKEND_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=_subprocess_env(),
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,  # line-buffered reads on the parent side
        )
        assert proc.stdout is not None
        with proc.stdout:
            for raw in proc.stdout:
                line = raw.rstrip()
                if line:
                    self._log.append(line)
        return proc.wait()

    def _latest_report(self, kind: str, after_ts: float) -> Optional[str]:
        """Newest <kind>-*.json written during/after this run (its report stem)."""
        if not _BENCH_DIR.is_dir():
            return None
        candidates = [
            p for p in _BENCH_DIR.glob(f"{kind}-*.json")
            if p.stat().st_mtime >= after_ts - 2
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p.stat().st_mtime).stem

    def status(self) -> Dict[str, Any]:
        return {**self._state, "log": list(self._log)}


def _subprocess_env() -> Dict[str, str]:
    """Inherit the parent env but force UTF-8 + no Ultralytics auto-install."""
    import os

    env = dict(os.environ)
    env.setdefault("YOLO_AUTOINSTALL", "False")
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    # Unbuffered child stdout so the polled log tail updates in near real time
    # (piped stdout is block-buffered by default).
    env["PYTHONUNBUFFERED"] = "1"
    return env
