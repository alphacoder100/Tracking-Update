"""
Dataset loaders for the benchmark harness.

Recognition — a *folder-per-identity* layout: each immediate sub-directory of the
root is one person, and every image anywhere beneath it is a sample of that
person. This matches `storage/visitor_photos/<visitor-uuid>/...` exactly (so the
system's own auto-saved crops become a labelled re-ID set with zero prep), and it
is also the standard LFW-style layout, so you can drop in any external dataset.

    root/
      alice/   a1.jpg a2.jpg ...
      bob/     b1.jpg faces/b2.jpg ...

Detection — a flat folder of images, with optional YOLO-format label .txt files
(one per image, same stem) giving ground-truth person boxes.

NOTE on the visitor_photos source: those identities were grouped by the *current*
recognition model, so it scores against labels it helped create — useful for a
relative A/B and for threshold tuning, but for an unbiased absolute number use a
hand-verified or external dataset. This caveat is printed at load time.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from .common import list_images, set_seed


# ──────────────────────────────────────────────────────────────────────────
#  Recognition dataset
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class RecognitionDataset:
    # identity label -> list of image paths (only identities with >= 1 image)
    identities: Dict[str, List[Path]]
    root: Path

    @property
    def n_identities(self) -> int:
        return len(self.identities)

    @property
    def n_images(self) -> int:
        return sum(len(v) for v in self.identities.values())

    @property
    def n_multi(self) -> int:
        """Identities with >= 2 images (the ones that can form genuine pairs)."""
        return sum(1 for v in self.identities.values() if len(v) >= 2)


def load_recognition_dataset(
    root: Path, min_images: int = 1, max_per_identity: Optional[int] = None
) -> RecognitionDataset:
    """Discover a folder-per-identity dataset under `root`."""
    root = Path(root)
    if not root.is_dir():
        raise FileNotFoundError(f"Dataset root not found: {root}")

    identities: Dict[str, List[Path]] = {}
    for sub in sorted(p for p in root.iterdir() if p.is_dir()):
        imgs = list_images(sub)
        if max_per_identity is not None and len(imgs) > max_per_identity:
            imgs = imgs[:max_per_identity]
        if len(imgs) >= min_images:
            identities[sub.name] = imgs

    if not identities:
        raise ValueError(f"No identity sub-folders with images found under {root}")
    return RecognitionDataset(identities=identities, root=root)


def sample_pairs(
    embeddings_by_identity: Dict[str, np.ndarray],
    max_genuine: int = 20_000,
    max_impostor: int = 40_000,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build genuine and impostor cosine-similarity arrays from per-identity
    embeddings (each value already L2-normalized, shape [n_i, dim]).

    Genuine = all within-identity pairs (capped). Impostor = randomly sampled
    cross-identity pairs (capped, to keep the O(N^2) explosion in check).
    """
    rng = set_seed(seed)
    ids = [k for k, v in embeddings_by_identity.items() if len(v) >= 1]

    # ---- genuine: within-identity pairs ----
    genuine: List[float] = []
    for k in ids:
        emb = embeddings_by_identity[k]
        n = len(emb)
        if n < 2:
            continue
        sims = emb @ emb.T
        iu = np.triu_indices(n, k=1)
        genuine.extend(sims[iu].tolist())
    genuine_arr = np.asarray(genuine, dtype=np.float64)
    if len(genuine_arr) > max_genuine:
        genuine_arr = rng.choice(genuine_arr, size=max_genuine, replace=False)

    # ---- impostor: random cross-identity single-image pairs ----
    multi_ids = [k for k in ids if len(embeddings_by_identity[k]) >= 1]
    impostor: List[float] = []
    if len(multi_ids) >= 2:
        attempts = 0
        target = max_impostor
        max_attempts = target * 4
        while len(impostor) < target and attempts < max_attempts:
            attempts += 1
            a, b = rng.choice(len(multi_ids), size=2, replace=False)
            ea = embeddings_by_identity[multi_ids[a]]
            eb = embeddings_by_identity[multi_ids[b]]
            va = ea[rng.integers(len(ea))]
            vb = eb[rng.integers(len(eb))]
            impostor.append(float(va @ vb))
    impostor_arr = np.asarray(impostor, dtype=np.float64)

    return genuine_arr, impostor_arr


# ──────────────────────────────────────────────────────────────────────────
#  Detection dataset
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class DetectionSample:
    image_path: Path
    gt_boxes: Optional[np.ndarray]  # [N,4] xyxy in pixels, or None if unlabelled


@dataclass
class DetectionDataset:
    samples: List[DetectionSample]
    has_labels: bool

    def __len__(self) -> int:
        return len(self.samples)


def _read_yolo_label(
    label_path: Path, img_w: int, img_h: int, person_class: int = 0
) -> np.ndarray:
    """Parse a YOLO-format label file → person boxes as pixel xyxy."""
    boxes: List[List[float]] = []
    for line in label_path.read_text().splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        cls = int(float(parts[0]))
        if cls != person_class:
            continue
        cx, cy, w, h = (float(v) for v in parts[1:5])
        x1 = (cx - w / 2) * img_w
        y1 = (cy - h / 2) * img_h
        x2 = (cx + w / 2) * img_w
        y2 = (cy + h / 2) * img_h
        boxes.append([x1, y1, x2, y2])
    return np.asarray(boxes, dtype=np.float64) if boxes else np.zeros((0, 4))


def load_detection_dataset(
    images_dir: Path,
    labels_dir: Optional[Path] = None,
    person_class: int = 0,
) -> DetectionDataset:
    """
    Discover images and (optionally) matching YOLO-format ground-truth labels.

    Label files must share the image stem (image `frame_007.jpg` -> `frame_007.txt`)
    and live in `labels_dir` (defaults to a sibling `labels/` next to the images).
    Reading image dimensions for label scaling is deferred to the benchmark, so we
    only resolve label *paths* here.
    """
    import cv2  # local import: only detection needs OpenCV box scaling

    images_dir = Path(images_dir)
    imgs = list_images(images_dir)
    if not imgs:
        raise ValueError(f"No images found under {images_dir}")

    if labels_dir is None:
        cand = images_dir / "labels"
        labels_dir = cand if cand.is_dir() else None
    else:
        labels_dir = Path(labels_dir)

    samples: List[DetectionSample] = []
    has_labels = False
    for img_path in imgs:
        gt = None
        if labels_dir is not None:
            lbl = labels_dir / f"{img_path.stem}.txt"
            if lbl.is_file():
                im = cv2.imread(str(img_path))
                if im is not None:
                    h, w = im.shape[:2]
                    gt = _read_yolo_label(lbl, w, h, person_class)
                    has_labels = True
        samples.append(DetectionSample(image_path=img_path, gt_boxes=gt))

    return DetectionDataset(samples=samples, has_labels=has_labels)
