"""
Pure-NumPy metrics (no scikit-learn dependency).

Recognition (verification) metrics from genuine/impostor cosine-similarity scores:
    EER, AUC, TAR@FAR, best-accuracy threshold, d-prime separation.

Detection metrics from predicted vs ground-truth boxes:
    IoU matching, precision / recall / F1, VOC-style AP@IoU.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

import numpy as np


# ──────────────────────────────────────────────────────────────────────────
#  Recognition / verification
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class VerificationMetrics:
    genuine_pairs: int
    impostor_pairs: int
    auc: float
    eer: float
    eer_threshold: float
    balanced_acc: float          # max (TPR+TNR)/2 — robust to genuine/impostor ratio
    best_threshold: float        # the cosine cut-point achieving balanced_acc
    tar_at_far: Dict[str, float]          # e.g. {"1e-3": 0.91, "1e-2": 0.97}
    genuine_mean: float
    impostor_mean: float
    d_prime: float

    def as_dict(self) -> dict:
        d = self.__dict__.copy()
        return d


def verification_metrics(
    genuine: np.ndarray,
    impostor: np.ndarray,
    far_targets: Sequence[float] = (1e-3, 1e-2, 1e-1),
) -> VerificationMetrics:
    """
    Compute verification metrics from two arrays of cosine similarities.

    `genuine`  — similarities of same-person face pairs (should be high).
    `impostor` — similarities of different-person face pairs (should be low).
    """
    genuine = np.asarray(genuine, dtype=np.float64).ravel()
    impostor = np.asarray(impostor, dtype=np.float64).ravel()
    P, N = len(genuine), len(impostor)
    if P == 0 or N == 0:
        raise ValueError("Need at least one genuine and one impostor pair.")

    scores = np.concatenate([genuine, impostor])
    labels = np.concatenate([np.ones(P), np.zeros(N)])

    # Sort by descending score: as the threshold drops, we accept more pairs.
    order = np.argsort(-scores, kind="mergesort")
    scores_sorted = scores[order]
    labels_sorted = labels[order]

    tp = np.cumsum(labels_sorted)            # genuine accepted at each threshold
    fp = np.cumsum(1.0 - labels_sorted)      # impostor accepted (false accepts)
    tpr = tp / P                             # = TAR (true accept rate)
    fpr = fp / N                             # = FAR (false accept rate)

    # Trapezoidal AUC (fpr is non-decreasing). Manual integration avoids the
    # np.trapz/np.trapezoid rename churn across NumPy 1.x ↔ 2.x.
    auc = float(np.sum(np.diff(fpr) * (tpr[1:] + tpr[:-1]) / 2.0))

    # EER: where FAR == FRR (FRR = 1 - TAR).
    fnr = 1.0 - tpr
    eer_idx = int(np.argmin(np.abs(fpr - fnr)))
    eer = float((fpr[eer_idx] + fnr[eer_idx]) / 2.0)
    eer_threshold = float(scores_sorted[eer_idx])

    # Threshold maximizing BALANCED accuracy = (TPR + TNR) / 2. Plain accuracy is
    # useless here because impostor pairs vastly outnumber genuine ones (a "reject
    # all" cut scores ~99%); balanced accuracy is invariant to that ratio, so the
    # cut-point it picks is a sensible RETURNING_FACE_THRESHOLD recommendation.
    tnr = (N - fp) / N
    balanced = (tpr + tnr) / 2.0
    best_idx = int(np.argmax(balanced))
    balanced_acc = float(balanced[best_idx])
    best_threshold = float(scores_sorted[best_idx])

    # TAR at fixed FAR operating points (impostor-quantile thresholds).
    imp_desc = np.sort(impostor)[::-1]
    tar_at_far: Dict[str, float] = {}
    for far in far_targets:
        k = int(np.ceil(far * N)) - 1
        k = min(max(k, 0), N - 1)
        thr = imp_desc[k]
        tar_at_far[_fmt_far(far)] = float(np.mean(genuine >= thr))

    g_mean, i_mean = float(genuine.mean()), float(impostor.mean())
    g_var, i_var = float(genuine.var()), float(impostor.var())
    d_prime = float((g_mean - i_mean) / np.sqrt((g_var + i_var) / 2.0 + 1e-12))

    return VerificationMetrics(
        genuine_pairs=P,
        impostor_pairs=N,
        auc=auc,
        eer=eer,
        eer_threshold=eer_threshold,
        balanced_acc=balanced_acc,
        best_threshold=best_threshold,
        tar_at_far=tar_at_far,
        genuine_mean=g_mean,
        impostor_mean=i_mean,
        d_prime=d_prime,
    )


def _fmt_far(far: float) -> str:
    return f"{far:.0e}".replace("e-0", "e-").replace("e+0", "e+")


# ──────────────────────────────────────────────────────────────────────────
#  Detection
# ──────────────────────────────────────────────────────────────────────────


def iou_matrix(boxes_a: np.ndarray, boxes_b: np.ndarray) -> np.ndarray:
    """IoU between every box in A and every box in B. Boxes are [x1,y1,x2,y2]."""
    if len(boxes_a) == 0 or len(boxes_b) == 0:
        return np.zeros((len(boxes_a), len(boxes_b)), dtype=np.float64)
    a = boxes_a[:, None, :].astype(np.float64)
    b = boxes_b[None, :, :].astype(np.float64)
    ix1 = np.maximum(a[..., 0], b[..., 0])
    iy1 = np.maximum(a[..., 1], b[..., 1])
    ix2 = np.minimum(a[..., 2], b[..., 2])
    iy2 = np.minimum(a[..., 3], b[..., 3])
    iw = np.clip(ix2 - ix1, 0, None)
    ih = np.clip(iy2 - iy1, 0, None)
    inter = iw * ih
    area_a = np.clip(a[..., 2] - a[..., 0], 0, None) * np.clip(a[..., 3] - a[..., 1], 0, None)
    area_b = np.clip(b[..., 2] - b[..., 0], 0, None) * np.clip(b[..., 3] - b[..., 1], 0, None)
    union = area_a + area_b - inter
    return np.where(union > 0, inter / union, 0.0)


@dataclass
class DetectionMatch:
    """Per-image greedy match of predictions to ground truth at an IoU threshold."""

    tp: List[Tuple[float, bool]] = field(default_factory=list)  # (confidence, is_TP)
    n_gt: int = 0


def match_image(
    pred_boxes: np.ndarray,
    pred_scores: np.ndarray,
    gt_boxes: np.ndarray,
    iou_thr: float = 0.5,
) -> DetectionMatch:
    """Greedy highest-confidence-first matching of predictions to GT (one-to-one)."""
    m = DetectionMatch(n_gt=len(gt_boxes))
    if len(pred_boxes) == 0:
        return m
    order = np.argsort(-pred_scores)
    ious = iou_matrix(pred_boxes[order], gt_boxes) if len(gt_boxes) else None
    gt_used = np.zeros(len(gt_boxes), dtype=bool)
    for rank, pi in enumerate(order):
        is_tp = False
        if ious is not None and len(gt_boxes):
            row = ious[rank].copy()
            row[gt_used] = -1.0
            best = int(np.argmax(row)) if row.size else -1
            if best >= 0 and row[best] >= iou_thr:
                gt_used[best] = True
                is_tp = True
        m.tp.append((float(pred_scores[pi]), is_tp))
    return m


@dataclass
class DetectionMetrics:
    precision: float
    recall: float
    f1: float
    ap50: float
    tp: int
    fp: int
    fn: int
    n_pred: int
    n_gt: int

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def detection_metrics(matches: List[DetectionMatch]) -> DetectionMetrics:
    """Aggregate per-image matches into precision/recall/F1 and VOC AP@IoU."""
    all_tp: List[Tuple[float, bool]] = []
    n_gt = 0
    for m in matches:
        all_tp.extend(m.tp)
        n_gt += m.n_gt

    n_pred = len(all_tp)
    if n_pred == 0:
        return DetectionMetrics(0, 0, 0, 0, 0, 0, n_gt, 0, n_gt)

    all_tp.sort(key=lambda x: -x[0])           # highest confidence first
    tp_flags = np.array([t for _, t in all_tp], dtype=np.float64)
    tp_cum = np.cumsum(tp_flags)
    fp_cum = np.cumsum(1.0 - tp_flags)

    recalls = tp_cum / n_gt if n_gt else np.zeros_like(tp_cum)
    precisions = tp_cum / np.maximum(tp_cum + fp_cum, 1e-12)

    # VOC-style AP: integrate the monotonic (max-to-the-right) precision envelope.
    mrec = np.concatenate([[0.0], recalls, [recalls[-1] if len(recalls) else 0.0]])
    mpre = np.concatenate([[0.0], precisions, [0.0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    ap50 = float(np.sum((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]))

    tp_total = int(tp_cum[-1])
    fp_total = int(fp_cum[-1])
    fn_total = int(n_gt - tp_total)
    precision = tp_total / max(tp_total + fp_total, 1)
    recall = tp_total / max(n_gt, 1)
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    return DetectionMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        ap50=ap50,
        tp=tp_total,
        fp=fp_total,
        fn=fn_total,
        n_pred=n_pred,
        n_gt=n_gt,
    )
