"""
Detection orchestration shared by /api/detect and the camera service.

For a list of DetectedPerson from one frame:
  resolve identity → register/update visitor → track visit → write audit event.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.cv_pipeline import DetectedPerson
from app.models import DetectionEvent, Visitor
from app.services import auto_enroller, identity_resolver
from app.services.visit_tracker import VisitTracker

logger = logging.getLogger(__name__)


@dataclass
class ProcessedDetection:
    bbox: dict
    visitor_id: Optional[UUID] = None
    is_new: bool = False
    is_ambiguous: bool = False
    visit_id: Optional[UUID] = None
    face_confidence: Optional[float] = None
    body_confidence: Optional[float] = None
    match_source: str = "none"

    @property
    def status(self) -> str:
        if self.is_ambiguous:
            return "ambiguous"
        if self.is_new:
            return "new"
        if self.visitor_id is not None:
            return "returning"
        return "none"

    @property
    def label(self) -> str:
        if self.is_ambiguous:
            return "AMBIGUOUS"
        if self.is_new:
            return "NEW visitor"
        if self.visitor_id is not None:
            sim = self.face_confidence or self.body_confidence or 0.0
            return f"Visitor {str(self.visitor_id)[:8]} ({sim:.2f})"
        return ""


def _crop(frame: np.ndarray, bbox: Optional[dict]) -> Optional[np.ndarray]:
    if frame is None or not bbox:
        return None
    h, w = frame.shape[:2]
    x1 = max(0, min(w, int(bbox.get("x1", 0))))
    y1 = max(0, min(h, int(bbox.get("y1", 0))))
    x2 = max(0, min(w, int(bbox.get("x2", 0))))
    y2 = max(0, min(h, int(bbox.get("y2", 0))))
    if x2 - x1 < 4 or y2 - y1 < 4:
        return None
    return frame[y1:y2, x1:x2]


async def process_detections(
    db: AsyncSession,
    detections: List[DetectedPerson],
    frame: Optional[np.ndarray] = None,
    camera_id: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    frame_path: Optional[str] = None,
) -> List[ProcessedDetection]:
    """Resolve, enroll, visit-track and audit every face-bearing detection."""
    timestamp = timestamp or datetime.now(timezone.utc)
    tracker = VisitTracker.get_instance()

    matchable = [d for d in detections if d.face_embedding]
    if not matchable:
        return []

    faces = [
        {
            "face_embedding": d.face_embedding,
            "body_embedding": d.body_embedding,
            "det_score": d.face_det_score or 0.0,
        }
        for d in matchable
    ]
    resolutions = await identity_resolver.resolve_batch(faces, db)

    out: List[ProcessedDetection] = []
    for det, res in zip(matchable, resolutions):
        det_score = det.face_det_score or 0.0
        face_crop = _crop(frame, det.face_bbox or det.bbox)

        pd = ProcessedDetection(
            bbox=det.face_bbox or det.bbox,
            is_ambiguous=res.is_ambiguous,
            face_confidence=round(res.face_similarity, 4) if res.face_similarity else None,
            body_confidence=round(res.body_similarity, 4) if res.body_similarity else None,
            match_source=res.match_source,
        )

        if res.is_ambiguous:
            db.add(
                DetectionEvent(
                    detected_at=timestamp,
                    face_similarity=res.face_similarity or None,
                    is_new_visitor=False,
                    is_ambiguous=True,
                    match_source="none",
                    camera_id=camera_id,
                    frame_path=frame_path,
                    bbox=pd.bbox,
                )
            )
            out.append(pd)
            continue

        if res.is_new:
            visitor = await auto_enroller.register_new_visitor(
                db,
                face_embedding=det.face_embedding,
                det_score=det_score,
                body_embedding=det.body_embedding,
                face_crop=face_crop,
            )
            pd.visitor_id = visitor.id
            pd.is_new = True
        elif res.visitor_id is not None:
            pd.visitor_id = res.visitor_id
            visitor = await db.get(Visitor, res.visitor_id)
            if visitor is not None and res.match_source == "face":
                await auto_enroller.update_after_match(
                    db,
                    visitor,
                    face_embedding=det.face_embedding,
                    det_score=det_score,
                    face_similarity=res.face_similarity,
                    body_embedding=det.body_embedding,
                    face_crop=face_crop,
                )
        else:
            # Dropped (grey zone, low quality) — record nothing identity-bearing.
            out.append(pd)
            continue

        visit_id, is_new_visit = await tracker.process_detection(
            db,
            visitor_id=pd.visitor_id,
            timestamp=timestamp,
            confidence=det_score,
            camera_id=camera_id,
        )
        pd.visit_id = visit_id

        db.add(
            DetectionEvent(
                visitor_id=pd.visitor_id,
                visit_id=visit_id,
                detected_at=timestamp,
                face_similarity=res.face_similarity or None,
                body_similarity=res.body_similarity or None,
                is_new_visitor=pd.is_new,
                is_ambiguous=False,
                match_source=res.match_source,
                camera_id=camera_id,
                frame_path=frame_path,
                bbox=pd.bbox,
            )
        )
        out.append(pd)

    await db.commit()
    return out
