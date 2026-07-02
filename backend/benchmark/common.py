"""Shared helpers for the benchmark harness — device resolution, timing, IO.

Deliberately decoupled from app.config / SQLAlchemy so the harness runs without a
database or a populated .env (see backend/benchmark/__init__.py).
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, List

import numpy as np

# Image extensions we treat as samples.
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def resolve_device(requested: str) -> str:
    """Map "auto"|"cpu"|"cuda"|"gpu" to a concrete "cpu"/"cuda" honouring hardware."""
    req = (requested or "auto").strip().lower()
    try:
        import torch

        has_cuda = bool(torch.cuda.is_available() and torch.cuda.device_count() > 0)
    except Exception:
        has_cuda = False
    if req == "auto":
        return "cuda" if has_cuda else "cpu"
    if req in ("cuda", "gpu"):
        if has_cuda:
            return "cuda"
        print("  [warn] cuda requested but no usable GPU found — using cpu.")
        return "cpu"
    return "cpu"


def onnx_providers(device: str) -> List[str]:
    """ONNXRuntime provider list for InsightFace given a resolved device."""
    if device == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


class Timer:
    """Accumulates per-call wall-clock (ms) over many calls.

    Reports total, per-call mean and FPS (as before) plus the full latency
    distribution — p50/p95/p99, min/max and std — so a stall a mean would hide is
    visible. Keeps every sample; call counts here are bounded (frames/faces), so
    the memory is negligible.
    """

    def __init__(self) -> None:
        self.samples_ms: List[float] = []

    @contextmanager
    def measure(self) -> Iterator[None]:
        t0 = time.perf_counter()
        try:
            yield
        finally:
            self.samples_ms.append((time.perf_counter() - t0) * 1000.0)

    @property
    def calls(self) -> int:
        return len(self.samples_ms)

    @property
    def total_s(self) -> float:
        return sum(self.samples_ms) / 1000.0

    @property
    def mean_ms(self) -> float:
        return (sum(self.samples_ms) / len(self.samples_ms)) if self.samples_ms else 0.0

    @property
    def fps(self) -> float:
        total = self.total_s
        return (self.calls / total) if total > 0 else 0.0

    def latency_stats(self) -> dict:
        """Per-call latency distribution in ms (empty-safe, all zeros if no calls)."""
        if not self.samples_ms:
            return {k: 0.0 for k in ("ms_p50", "ms_p95", "ms_p99", "ms_min", "ms_max", "ms_std")}
        arr = np.asarray(self.samples_ms, dtype=np.float64)
        return {
            "ms_p50": round(float(np.percentile(arr, 50)), 2),
            "ms_p95": round(float(np.percentile(arr, 95)), 2),
            "ms_p99": round(float(np.percentile(arr, 99)), 2),
            "ms_min": round(float(arr.min()), 2),
            "ms_max": round(float(arr.max()), 2),
            "ms_std": round(float(arr.std()), 2),
        }


def list_images(directory: Path) -> List[Path]:
    """All image files directly under (and below) a directory, sorted."""
    return sorted(
        p for p in directory.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def set_seed(seed: int) -> np.random.Generator:
    """Return a seeded NumPy Generator so pair sampling is reproducible."""
    return np.random.default_rng(seed)


def l2_normalize(v: np.ndarray, axis: int = -1, eps: float = 1e-10) -> np.ndarray:
    """L2-normalize along an axis (rows by default)."""
    norm = np.linalg.norm(v, axis=axis, keepdims=True)
    return v / np.maximum(norm, eps)
