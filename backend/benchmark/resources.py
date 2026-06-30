"""
Resource sampling for the video benchmark.

A background thread polls CPU / RAM (via psutil) and GPU utilisation / VRAM (via
pynvml) at a fixed interval while a measured block runs, then reports the mean and
peak of each. Used to record what each model+device combination actually costs.

GPU numbers are DEVICE-WIDE (NVML reports the whole card, not just this process),
so close other GPU workloads for a clean read. CPU% is per-process and can exceed
100% on multi-core machines (it is the sum across cores).
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ResourceStats:
    cpu_pct_mean: float = 0.0
    cpu_pct_peak: float = 0.0
    ram_mb_mean: float = 0.0
    ram_mb_peak: float = 0.0
    gpu_pct_mean: Optional[float] = None
    gpu_pct_peak: Optional[float] = None
    vram_mb_mean: Optional[float] = None
    vram_mb_peak: Optional[float] = None
    samples: int = 0

    def as_dict(self) -> dict:
        return {
            "cpu_pct_mean": round(self.cpu_pct_mean, 1),
            "cpu_pct_peak": round(self.cpu_pct_peak, 1),
            "ram_mb_mean": round(self.ram_mb_mean, 1),
            "ram_mb_peak": round(self.ram_mb_peak, 1),
            "gpu_pct_mean": None if self.gpu_pct_mean is None else round(self.gpu_pct_mean, 1),
            "gpu_pct_peak": None if self.gpu_pct_peak is None else round(self.gpu_pct_peak, 1),
            "vram_mb_mean": None if self.vram_mb_mean is None else round(self.vram_mb_mean, 1),
            "vram_mb_peak": None if self.vram_mb_peak is None else round(self.vram_mb_peak, 1),
        }


def gpu_name() -> Optional[str]:
    """Name of GPU 0 via NVML, or None when no NVIDIA GPU / NVML unavailable."""
    try:
        import pynvml

        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        return name.decode() if isinstance(name, bytes) else str(name)
    except Exception:
        return None


def cpu_name() -> str:
    """Best-effort human CPU name (platform fallback if nothing better)."""
    import platform

    proc = platform.processor()
    return proc or platform.machine() or "unknown CPU"


class ResourceSampler:
    """
    Context manager that samples CPU/RAM/GPU on a background thread.

        with ResourceSampler(track_gpu=True) as sampler:
            ...work...
        stats = sampler.stats   # ResourceStats
    """

    def __init__(self, interval_s: float = 0.1, track_gpu: bool = False):
        self.interval_s = interval_s
        self.track_gpu = track_gpu
        self.stats = ResourceStats()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._cpu: List[float] = []
        self._ram: List[float] = []
        self._gpu: List[float] = []
        self._vram: List[float] = []
        self._proc = None
        self._nvml_handle = None

    def __enter__(self) -> "ResourceSampler":
        try:
            import psutil

            self._proc = psutil.Process()
            # Prime cpu_percent so the first real sample is meaningful (psutil
            # returns 0.0 on the first call — it measures since the previous one).
            self._proc.cpu_percent(None)
        except Exception:
            self._proc = None

        if self.track_gpu:
            try:
                import pynvml

                pynvml.nvmlInit()
                self._nvml_handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            except Exception:
                self._nvml_handle = None

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        self._finalize()

    def _loop(self) -> None:
        import pynvml  # type: ignore

        while not self._stop.is_set():
            if self._proc is not None:
                try:
                    self._cpu.append(self._proc.cpu_percent(None))
                    self._ram.append(self._proc.memory_info().rss / (1024 * 1024))
                except Exception:
                    pass
            if self._nvml_handle is not None:
                try:
                    self._gpu.append(float(pynvml.nvmlDeviceGetUtilizationRates(self._nvml_handle).gpu))
                    self._vram.append(pynvml.nvmlDeviceGetMemoryInfo(self._nvml_handle).used / (1024 * 1024))
                except Exception:
                    pass
            self._stop.wait(self.interval_s)

    def _finalize(self) -> None:
        def mean(xs: List[float]) -> float:
            return sum(xs) / len(xs) if xs else 0.0

        self.stats.samples = max(len(self._cpu), len(self._gpu))
        if self._cpu:
            self.stats.cpu_pct_mean = mean(self._cpu)
            self.stats.cpu_pct_peak = max(self._cpu)
        if self._ram:
            self.stats.ram_mb_mean = mean(self._ram)
            self.stats.ram_mb_peak = max(self._ram)
        if self._gpu:
            self.stats.gpu_pct_mean = mean(self._gpu)
            self.stats.gpu_pct_peak = max(self._gpu)
        if self._vram:
            self.stats.vram_mb_mean = mean(self._vram)
            self.stats.vram_mb_peak = max(self._vram)
