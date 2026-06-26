"""
Split a contaminated visitor — separate a gallery that holds TWO people into two
distinct visitor records.

A single false match (usually the temporal gate pairing two people who crossed
paths) can inject a second person's face into a visitor's gallery; from there the
gallery search "magnets" in more of that second person and the within-gallery
mean similarity collapses into different-person territory (see the GALLERY &
MATCHING panel: a mean of ~0.28 ± 0.28 is two clusters, not one diverse person).

This tool clusters the gallery embeddings into two groups, keeps the DOMINANT
cluster on the existing record, and moves the minority cluster into a brand-new
visitor (re-pointing those visitor_faces rows, moving their crop files, and
recomputing both centroids + adaptive thresholds).

NOTE: visits / detection_events are attributed to the visitor, not to individual
faces, so they CANNOT be re-split reliably — they stay with the original record.
The new record starts fresh and accumulates its own history going forward.

Usage:
    # Inspect the split without writing anything (default):
    python -m scripts.split_contaminated_visitor --visitor-id <uuid>

    # Apply it:
    python -m scripts.split_contaminated_visitor --visitor-id <uuid> --apply

    # Apply even when the two clusters aren't cleanly separated:
    python -m scripts.split_contaminated_visitor --visitor-id <uuid> --apply --force
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path
from uuid import UUID, uuid4

# Ensure the app package is importable when run from backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Visitor, VisitorFace
from app.services.auto_enroller import (
    recompute_centroid_from_gallery,
    recompute_adaptive_thresholds,
    _save_thumbnail,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("split")

# Minimum gap between the weaker within-cluster mean similarity and the
# cross-cluster mean similarity for the split to be considered "clean" (two
# genuinely different people). Below this the two clusters overlap too much to
# trust the split automatically; require --force.
_MIN_SEPARATION = 0.10


def _spherical_2means(X: np.ndarray, iters: int = 25) -> np.ndarray:
    """
    Cluster L2-normalized embeddings into 2 groups (spherical k-means; cosine ==
    dot product on normalized rows). Seeded with the most DISSIMILAR pair of
    faces so a bimodal "two people" gallery splits along its natural fault line.
    Returns a label array (0/1) per row.
    """
    n = X.shape[0]
    sims = X @ X.T
    iu = np.triu_indices(n, k=1)
    p = int(np.argmin(sims[iu]))            # the least-similar pair → seeds
    centroids = np.stack([X[iu[0][p]], X[iu[1][p]]]).astype(np.float32)

    labels = np.full(n, -1, dtype=int)
    for _ in range(iters):
        new_labels = np.argmax(X @ centroids.T, axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for c in (0, 1):
            members = X[labels == c]
            if len(members) == 0:
                continue
            m = members.mean(axis=0)
            nrm = np.linalg.norm(m)
            if nrm > 0:
                centroids[c] = (m / nrm).astype(np.float32)
    return labels


def _cluster_stats(X: np.ndarray, labels: np.ndarray) -> dict:
    """Within-cluster and cross-cluster mean cosine similarities."""
    sims = X @ X.T
    within = {}
    for c in (0, 1):
        idx = np.where(labels == c)[0]
        if len(idx) >= 2:
            sub = sims[np.ix_(idx, idx)]
            iu = np.triu_indices(len(idx), k=1)
            within[c] = float(sub[iu].mean())
        else:
            within[c] = float("nan")
    a = np.where(labels == 0)[0]
    b = np.where(labels == 1)[0]
    cross = float(sims[np.ix_(a, b)].mean()) if len(a) and len(b) else float("nan")
    return {"within": within, "cross": cross}


def _move_crop(face: VisitorFace, new_visitor_id: UUID) -> None:
    """Move a face's crop file into the new visitor's faces dir; update the row."""
    if not face.crop_path:
        return
    src = Path(face.crop_path)
    if not src.exists():
        return
    dst_dir = Path(settings.VISITOR_PHOTO_DIR) / str(new_visitor_id) / "faces"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / src.name
    try:
        src.replace(dst)
        face.crop_path = str(dst)
    except Exception as exc:                       # noqa: BLE001
        logger.warning("Could not move crop %s -> %s (%s); keeping old path.",
                       src, dst, exc)


def _refresh_thumbnail(visitor: Visitor, faces: list[VisitorFace]) -> None:
    """Set the visitor thumbnail from the best-quality face crop available."""
    import cv2

    best = max(
        (f for f in faces if f.crop_path and Path(f.crop_path).exists()),
        key=lambda f: (f.det_score or 0.0),
        default=None,
    )
    if best is None:
        return
    crop = cv2.imread(best.crop_path)
    thumb = _save_thumbnail(visitor.id, crop)
    if thumb:
        visitor.thumbnail_path = thumb


async def _split(visitor_id: UUID, apply: bool, force: bool) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        visitor = await db.get(Visitor, visitor_id)
        if visitor is None:
            logger.error("Visitor %s not found.", visitor_id)
            await engine.dispose()
            return

        faces = (
            await db.execute(
                select(VisitorFace).where(VisitorFace.visitor_id == visitor_id)
            )
        ).scalars().all()

        usable = [f for f in faces if f.embedding is not None]
        if len(usable) < 4:
            logger.error(
                "Visitor %s has only %d usable gallery face(s) — too few to split "
                "(need >= 4). If it's clearly two people, delete and re-enroll.",
                visitor_id, len(usable),
            )
            await engine.dispose()
            return

        X = np.asarray([f.embedding for f in usable], dtype=np.float32)
        # Re-normalize defensively (rows should already be L2-normalized).
        X /= np.clip(np.linalg.norm(X, axis=1, keepdims=True), 1e-9, None)

        labels = _spherical_2means(X)
        stats = _cluster_stats(X, labels)

        idx0 = [i for i in range(len(usable)) if labels[i] == 0]
        idx1 = [i for i in range(len(usable)) if labels[i] == 1]

        # Keep the larger cluster (tie → higher total det_score) on the original.
        def _score(idx: list[int]) -> tuple[int, float]:
            return (len(idx), sum(usable[i].det_score or 0.0 for i in idx))

        keep_idx, move_idx = (idx0, idx1) if _score(idx0) >= _score(idx1) else (idx1, idx0)

        within_vals = [v for v in stats["within"].values() if v == v]  # drop NaN
        weaker_within = min(within_vals) if within_vals else float("nan")
        separation = weaker_within - stats["cross"]

        logger.info("── Split preview for visitor %s ──", visitor_id)
        logger.info("Gallery faces: %d", len(usable))
        logger.info(
            "Cluster A: %d faces (within-sim %.3f) | Cluster B: %d faces (within-sim %.3f)",
            len(idx0), stats["within"][0], len(idx1), stats["within"][1],
        )
        logger.info("Cross-cluster mean sim: %.3f", stats["cross"])
        logger.info(
            "Separation (weaker within − cross): %.3f  [clean split needs >= %.2f]",
            separation, _MIN_SEPARATION,
        )
        logger.info("Plan: KEEP %d faces on %s, MOVE %d faces to a NEW visitor.",
                    len(keep_idx), visitor_id, len(move_idx))

        if not apply:
            logger.info("Dry run — nothing written. Re-run with --apply to perform the split.")
            await engine.dispose()
            return

        if separation < _MIN_SEPARATION and not force:
            logger.error(
                "Clusters are not cleanly separated (%.3f < %.2f) — this may be one "
                "diverse person, not two. Re-run with --force to split anyway.",
                separation, _MIN_SEPARATION,
            )
            await engine.dispose()
            return

        # ── Apply ───────────────────────────────────────────────────────────
        new_visitor = Visitor(
            id=uuid4(),
            is_active=True,
            visit_count=0,
            consent_status=visitor.consent_status or "implicit",
            visit_confidence=0.3,
            total_faces_recorded=len(move_idx),
        )
        db.add(new_visitor)
        await db.flush()

        moved_faces = [usable[i] for i in move_idx]
        for f in moved_faces:
            f.visitor_id = new_visitor.id
            _move_crop(f, new_visitor.id)

        # Clear the (contaminated) personal thresholds first so that if a split
        # cluster is too small to recompute a distribution (< 3 faces), the record
        # safely falls back to the strict global threshold instead of keeping the
        # loosened ~0.40 bar that let the second person in.
        for v in (visitor, new_visitor):
            v.expected_match_similarity = None
            v.match_similarity_std = None
            v.personal_returning_threshold = None
            v.personal_new_threshold = None

        # Recompute both records' centroids + adaptive thresholds from their now
        # split galleries (the re-pointed rows are visible in this transaction).
        await recompute_centroid_from_gallery(db, visitor)
        await recompute_adaptive_thresholds(db, visitor)
        await recompute_centroid_from_gallery(db, new_visitor)
        await recompute_adaptive_thresholds(db, new_visitor)

        visitor.total_faces_recorded = len(keep_idx)
        _refresh_thumbnail(visitor, [usable[i] for i in keep_idx])
        _refresh_thumbnail(new_visitor, moved_faces)

        await db.commit()
        logger.info(
            "Done. Original %s kept %d faces; new visitor %s received %d faces. "
            "Visits/history stayed with the original (cannot be re-split).",
            visitor_id, len(keep_idx), new_visitor.id, len(move_idx),
        )

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a contaminated visitor into two.")
    parser.add_argument("--visitor-id", required=True, type=UUID, help="Visitor UUID to split")
    parser.add_argument("--apply", action="store_true", help="Perform the split (default: dry run)")
    parser.add_argument("--force", action="store_true", help="Split even if clusters overlap")
    args = parser.parse_args()
    asyncio.run(_split(args.visitor_id, args.apply, args.force))


if __name__ == "__main__":
    main()
