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
    """Accumulates wall-clock over many calls; reports total and per-call mean (ms)."""

    def __init__(self) -> None:
        self.total_s = 0.0
        self.calls = 0

    @contextmanager
    def measure(self) -> Iterator[None]:
        t0 = time.perf_counter()
        try:
            yield
        finally:
            self.total_s += time.perf_counter() - t0
            self.calls += 1

    @property
    def mean_ms(self) -> float:
        return (self.total_s / self.calls * 1000.0) if self.calls else 0.0

    @property
    def fps(self) -> float:
        return (self.calls / self.total_s) if self.total_s > 0 else 0.0


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
