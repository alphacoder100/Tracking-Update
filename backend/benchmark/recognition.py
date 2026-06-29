"""
Recognition-model benchmark.

For each candidate InsightFace pack (e.g. buffalo_l, buffalo_s, antelopev2):
  1. embed every image in the folder-per-identity dataset,
  2. build genuine / impostor cosine-similarity pairs,
  3. report EER, AUC, TAR@FAR, best-accuracy threshold, separation, latency.

Embedding modes (`--align`):
  • resize  (default) — resize each crop to the model's 112×112 input and embed
    via the recognition net directly. Identical preprocessing for every model and
    100% coverage, so it isolates *recognition* quality. Ideal for the tight,
    pre-cropped faces in storage/visitor_photos.
  • detect            — run the full detect→align→embed stack on each image
    (padded + upscaled first to help the detector). Realistic end-to-end number;
    coverage may be < 100% on tight crops and is reported.

The best-accuracy / EER thresholds map straight onto the RETURNING_FACE_THRESHOLD
knob in app/config.py, so the harness doubles as a threshold-tuning tool.
"""

from __future__ import annotations

from typing import Dict, List, Optional

import cv2
import numpy as np

from .common import Timer, l2_normalize, onnx_providers
from .datasets import RecognitionDataset, sample_pairs
from .metrics import verification_metrics


class RecognitionModel:
    """Thin wrapper over an InsightFace FaceAnalysis pack for benchmarking."""

    def __init__(self, name: str, device: str, det_size: int = 640):
        from insightface.app import FaceAnalysis

        self.name = name
        self.device = device
        use_cuda = device == "cuda"
        self.app = FaceAnalysis(
            name=name,
            providers=onnx_providers(device),
            allowed_modules=["detection", "recognition"],
        )
        self.app.prepare(ctx_id=0 if use_cuda else -1, det_size=(det_size, det_size))
        self.rec = (self.app.models or {}).get("recognition")
        if self.rec is None:
            raise RuntimeError(f"'{name}' has no recognition module")
        self.input_size = getattr(self.rec, "input_size", (112, 112))
        self.dim = int(getattr(self.rec, "output_shape", [0, 512])[-1] or 512)

    def embed_resize(self, image_bgr: np.ndarray) -> np.ndarray:
        """Resize the whole crop to the net input and embed directly (no detect)."""
        resized = cv2.resize(image_bgr, self.input_size, interpolation=cv2.INTER_LINEAR)
        feat = np.asarray(self.rec.get_feat(resized)).ravel()
        return l2_normalize(feat)

    def embed_detect(self, image_bgr: np.ndarray) -> Optional[np.ndarray]:
        """Full detect→align→embed; pad + upscale first to help tight crops."""
        prepped = _pad_and_upscale(image_bgr)
        faces = self.app.get(prepped)
        if not faces:
            return None
        best = max(faces, key=lambda f: f.det_score)
        return np.asarray(best.normed_embedding, dtype=np.float64).ravel()


def _pad_and_upscale(img: np.ndarray, margin: float = 0.4, min_side: int = 160) -> np.ndarray:
    """Add a reflect border + upscale so a face detector can work on a tight crop."""
    h, w = img.shape[:2]
    pad_y, pad_x = int(h * margin), int(w * margin)
    img = cv2.copyMakeBorder(img, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_REFLECT)
    h, w = img.shape[:2]
    short = min(h, w)
    if short < min_side:
        scale = min_side / short
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    return img


def _embed_dataset(
    model: RecognitionModel,
    dataset: RecognitionDataset,
    align: str,
    timer: Timer,
) -> tuple[Dict[str, np.ndarray], int, int]:
    """Embed every image; return {identity: [embeddings]}, embedded count, miss count."""
    out: Dict[str, np.ndarray] = {}
    embedded = misses = 0
    for ident, paths in dataset.identities.items():
        vecs: List[np.ndarray] = []
        for p in paths:
            img = cv2.imread(str(p))
            if img is None or img.size == 0:
                misses += 1
                continue
            try:
                with timer.measure():
                    if align == "detect":
                        emb = model.embed_detect(img)
                    else:
                        emb = model.embed_resize(img)
            except Exception:
                emb = None
            if emb is None or not np.all(np.isfinite(emb)):
                misses += 1
                continue
            vecs.append(emb)
            embedded += 1
        if vecs:
            out[ident] = np.vstack(vecs)
    return out, embedded, misses


def run_recognition_benchmark(
    model_names: List[str],
    dataset: RecognitionDataset,
    device: str,
    align: str = "resize",
    det_size: int = 640,
    max_genuine: int = 20_000,
    max_impostor: int = 40_000,
    seed: int = 42,
) -> List[dict]:
    """Benchmark each recognition model; returns one result dict per model."""
    results: List[dict] = []
    for name in model_names:
        print(f"\n▶ recognition model: {name}  (device={device}, align={align})")
        load_t = Timer()
        try:
            with load_t.measure():
                model = RecognitionModel(name, device, det_size=det_size)
        except Exception as exc:
            print(f"  [error] could not load '{name}': {exc}")
            results.append({"model": name, "error": str(exc)})
            continue

        infer_t = Timer()
        emb_by_id, embedded, misses = _embed_dataset(model, dataset, align, infer_t)
        n_multi = sum(1 for v in emb_by_id.values() if len(v) >= 2)
        total = embedded + misses
        coverage = embedded / total if total else 0.0
        print(
            f"  embedded {embedded}/{total} images ({coverage*100:.1f}% coverage) "
            f"across {len(emb_by_id)} identities ({n_multi} with ≥2)"
        )

        if n_multi < 1:
            print("  [error] no identity has ≥2 embeddable images — cannot form pairs.")
            results.append({"model": name, "error": "no genuine pairs", "coverage": coverage})
            continue

        genuine, impostor = sample_pairs(
            emb_by_id, max_genuine=max_genuine, max_impostor=max_impostor, seed=seed
        )
        metrics = verification_metrics(genuine, impostor)

        results.append({
            "model": name,
            "device": device,
            "align": align,
            "dim": model.dim,
            "identities": len(emb_by_id),
            "identities_multi": n_multi,
            "images_embedded": embedded,
            "coverage": coverage,
            "load_seconds": round(load_t.total_s, 2),
            "embed_ms_mean": round(infer_t.mean_ms, 2),
            "embed_fps": round(infer_t.fps, 1),
            **metrics.as_dict(),
        })
        m = metrics
        print(
            f"  AUC={m.auc:.4f}  EER={m.eer*100:.2f}%  "
            f"TAR@FAR1e-2={m.tar_at_far.get('1e-2', 0)*100:.1f}%  "
            f"bal-acc={m.balanced_acc*100:.2f}%@{m.best_threshold:.3f}  "
            f"{infer_t.mean_ms:.2f} ms/face"
        )
    return results
