"""
Detection-model benchmark (Ultralytics YOLO weights).

For each candidate weight (yolov8n.pt, yolov8s.pt, yolo11n.pt, …):
  • measure latency / FPS (warm),
  • count person detections + mean confidence,
  • if ground-truth labels exist → precision / recall / F1 / AP@0.5,
  • if not → score each model against the heaviest model's detections
    (the "consensus" reference), giving a relative agreement number.

Person class is COCO id 0, matching the production pipeline (ml_models.py).
"""

from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np

from .common import Timer
from .datasets import DetectionDataset
from .metrics import DetectionMatch, detection_metrics, match_image


class DetectionModel:
    """Wrapper over an Ultralytics YOLO model returning person boxes."""

    def __init__(self, weight: str, device: str, conf: float, imgsz: int = 640):
        from ultralytics import YOLO

        self.weight = weight
        self.device = device
        self.conf = conf
        self.imgsz = imgsz
        self.model = YOLO(weight)

    def detect(self, image) -> tuple[np.ndarray, np.ndarray]:
        """Return (boxes_xyxy [N,4], scores [N]) for person class only."""
        res = self.model.predict(
            image,
            verbose=False,
            conf=self.conf,
            classes=[0],
            imgsz=self.imgsz,
            device=self.device,
        )
        for r in res:
            if r.boxes is None or len(r.boxes) == 0:
                break
            xyxy = r.boxes.xyxy.cpu().numpy().astype(np.float64)
            conf = r.boxes.conf.cpu().numpy().astype(np.float64)
            return xyxy, conf
        return np.zeros((0, 4)), np.zeros((0,))


def _warmup(model: DetectionModel, image) -> None:
    try:
        model.detect(image)
    except Exception:
        pass


def run_detection_benchmark(
    weights: List[str],
    dataset: DetectionDataset,
    device: str,
    conf: float = 0.25,
    imgsz: int = 640,
    iou_thr: float = 0.5,
    reference: Optional[str] = None,
) -> List[dict]:
    """
    Benchmark each detection weight. With GT labels, metrics are absolute; without,
    they are measured against `reference` (default: the last/heaviest weight).
    """
    import cv2

    has_labels = dataset.has_labels
    if not has_labels:
        reference = reference or weights[-1]
        print(f"  no ground-truth labels → scoring against reference model: {reference}")

    # Pre-read images once (shared across models for fair, identical inputs).
    images = []
    for s in dataset.samples:
        im = cv2.imread(str(s.image_path))
        if im is not None:
            images.append((im, s.gt_boxes))
    if not images:
        raise ValueError("No readable images in detection dataset.")
    print(f"  {len(images)} images loaded")

    # First pass: collect per-model predictions + latency.
    preds_by_model: Dict[str, List[tuple]] = {}
    latency: Dict[str, Timer] = {}
    meta: Dict[str, dict] = {}

    for w in weights:
        print(f"\n▶ detection model: {w}  (device={device}, conf={conf}, imgsz={imgsz})")
        try:
            model = DetectionModel(w, device, conf, imgsz)
        except Exception as exc:
            print(f"  [error] could not load '{w}': {exc}")
            meta[w] = {"error": str(exc)}
            continue
        _warmup(model, images[0][0])

        t = Timer()
        preds: List[tuple] = []
        n_det = 0
        conf_sum = 0.0
        for im, _gt in images:
            with t.measure():
                boxes, scores = model.detect(im)
            preds.append((boxes, scores))
            n_det += len(boxes)
            conf_sum += float(scores.sum())
        preds_by_model[w] = preds
        latency[w] = t
        meta[w] = {
            "detections": n_det,
            "mean_conf": round(conf_sum / n_det, 3) if n_det else 0.0,
            "ms_mean": round(t.mean_ms, 2),
            "fps": round(t.fps, 1),
        }
        print(
            f"  {n_det} person boxes · {t.mean_ms:.2f} ms/img · {t.fps:.1f} FPS"
        )

    # Second pass: score predictions (vs GT, or vs the reference model).
    results: List[dict] = []
    for w in weights:
        if "error" in meta.get(w, {}):
            results.append({"model": w, **meta[w]})
            continue
        matches: List[DetectionMatch] = []
        for i, (boxes, scores) in enumerate(preds_by_model[w]):
            if has_labels:
                gt = images[i][1]
                gt = gt if gt is not None else np.zeros((0, 4))
            else:
                ref_boxes, _ = preds_by_model[reference][i]
                gt = ref_boxes
            matches.append(match_image(boxes, scores, gt, iou_thr=iou_thr))
        dm = detection_metrics(matches)
        results.append({
            "model": w,
            "device": device,
            "scored_against": "ground_truth" if has_labels else f"ref:{reference}",
            **meta[w],
            **dm.as_dict(),
        })
        print(
            f"  {w}: P={dm.precision:.3f} R={dm.recall:.3f} "
            f"F1={dm.f1:.3f} AP@0.5={dm.ap50:.3f}"
        )
    return results
