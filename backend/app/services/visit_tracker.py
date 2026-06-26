"""
Visit session tracker — in-memory state machine, persisted to the DB.

A visit stays open while detections keep arriving. After VISIT_COOLDOWN_MINUTES
of no detection a background task closes it; the next detection of that visitor
opens a brand-new visit (and increments visit_count). Active visits are
recovered from the DB on startup so a restart never loses an open session.

NOTE: state lives in process memory, so the app must run with a SINGLE worker.
For horizontal scale-out, move `active_visits` to Redis.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Tuple
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Visit, Visitor

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _infer_seated(bbox: dict, frame_shape: tuple) -> bool:
    """Heuristic: person in lower 60% of frame and bbox height < 40% = likely seated."""
    frame_height = frame_shape[0]
    y1 = bbox.get("y1", 0)
    y2 = bbox.get("y2", 0)
    return y2 > frame_height * 0.6 and (y2 - y1) < frame_height * 0.4


@dataclass
class ActiveVisit:
    visit_id: UUID
    visitor_id: UUID
    started_at: datetime
    last_detected_at: datetime
    detection_count: int
    best_confidence: float
    sum_confidence: float
    camera_id: Optional[str]
    was_seated: bool = False  # True → use SEATED_COOLDOWN_MINUTES


class VisitTracker:
    """Per-process tracker of currently-open visits."""

    _instance: Optional["VisitTracker"] = None

    def __init__(self):
        self.active_visits: Dict[UUID, ActiveVisit] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "VisitTracker":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def current_inside_count(self) -> int:
        return len(self.active_visits)

    async def recover_active(self, db: AsyncSession) -> None:
        """Load still-open visits (left_at IS NULL) into memory on startup."""
        rows = (
            await db.execute(select(Visit).where(Visit.left_at.is_(None)))
        ).scalars().all()
        async with self._lock:
            self.active_visits.clear()
            for v in rows:
                self.active_visits[v.visitor_id] = ActiveVisit(
                    visit_id=v.id,
                    visitor_id=v.visitor_id,
                    started_at=v.entered_at,
                    last_detected_at=v.updated_at or v.entered_at,
                    detection_count=v.detection_count or 0,
                    best_confidence=v.best_face_confidence or 0.0,
                    sum_confidence=(v.avg_face_confidence or 0.0) * (v.detection_count or 0),
                    camera_id=v.camera_id,
                )
        logger.info("Recovered %d active visit(s) from DB.", len(self.active_visits))
        # Heal any pre-existing duplicate open visits (e.g. left by an old merge).
        await self.reconcile_open_visits(db)

    def _effective_cooldown(self, visit: "ActiveVisit") -> timedelta:
        """Return the cooldown for this visit (seated = longer)."""
        minutes = (
            settings.SEATED_COOLDOWN_MINUTES
            if visit.was_seated
            else settings.VISIT_COOLDOWN_MINUTES
        )
        return timedelta(minutes=minutes)

    async def process_detection(
        self,
        db: AsyncSession,
        visitor_id: UUID,
        timestamp: datetime,
        confidence: float,
        camera_id: Optional[str] = None,
        bbox: Optional[dict] = None,
        frame_shape: Optional[tuple] = None,
    ) -> Tuple[UUID, bool]:
        """
        Record a detection for a visitor. Returns (visit_id, is_new_visit).
        Extends an open visit, or opens a new one (incrementing visit_count).
        Pass bbox + frame_shape to enable seated-person heuristic.
        """
        max_dur = timedelta(hours=settings.MAX_VISIT_DURATION_HOURS)

        async with self._lock:
            active = self.active_visits.get(visitor_id)
            if active is not None:
                # Update seated status from bounding-box heuristic
                if bbox and frame_shape:
                    active.was_seated = active.was_seated or _infer_seated(bbox, frame_shape)

                cooldown = self._effective_cooldown(active)
                gap = timestamp - active.last_detected_at
                open_for = timestamp - active.started_at
                # Cooldown is enforced HERE at detection time (not only by the
                # background cleanup task) so a return after cooldown minutes
                # is always counted as a new visit, regardless of cleanup cadence.
                if gap < cooldown and open_for < max_dur:
                    active.last_detected_at = timestamp
                    active.detection_count += 1
                    active.best_confidence = max(active.best_confidence, confidence)
                    active.sum_confidence += confidence
                    avg = active.sum_confidence / max(active.detection_count, 1)
                    await db.execute(
                        update(Visit)
                        .where(Visit.id == active.visit_id)
                        .values(
                            detection_count=active.detection_count,
                            best_face_confidence=active.best_confidence,
                            avg_face_confidence=avg,
                            updated_at=timestamp,
                        )
                    )
                    await db.execute(
                        update(Visitor)
                        .where(Visitor.id == visitor_id)
                        .values(last_seen_at=timestamp)
                    )
                    return active.visit_id, False

                # Gap exceeded the effective cooldown (or max-duration cap):
                # close this visit and fall through to open a new one.
                left_at = active.last_detected_at
                duration = max(0, int((left_at - active.started_at).total_seconds() // 60))
                await db.execute(
                    update(Visit)
                    .where(Visit.id == active.visit_id)
                    .values(left_at=left_at, duration_minutes=duration)
                )
                del self.active_visits[visitor_id]

            # New visit.
            visit = Visit(
                visitor_id=visitor_id,
                entered_at=timestamp,
                detection_count=1,
                best_face_confidence=confidence,
                avg_face_confidence=confidence,
                camera_id=camera_id,
                updated_at=timestamp,
            )
            db.add(visit)
            await db.flush()

            await db.execute(
                update(Visitor)
                .where(Visitor.id == visitor_id)
                .values(
                    visit_count=Visitor.visit_count + 1,
                    last_seen_at=timestamp,
                )
            )

            self.active_visits[visitor_id] = ActiveVisit(
                visit_id=visit.id,
                visitor_id=visitor_id,
                started_at=timestamp,
                last_detected_at=timestamp,
                detection_count=1,
                best_confidence=confidence,
                sum_confidence=confidence,
                camera_id=camera_id,
            )
            return visit.id, True

    async def reconcile_open_visits(
        self, db: AsyncSession, commit: bool = True
    ) -> int:
        """Guarantee at most ONE open visit per visitor.

        Two open (`left_at IS NULL`) visits for the same visitor are always
        erroneous. They appear when a MERGE re-points an open visit onto a target
        that already has one, or when a duplicate survives a restart (recover_active
        keys by visitor_id, so extras orphan and cleanup_stale — which only walks
        in-memory state — never closes them). For each affected visitor we keep the
        EARLIEST-started open visit (the real ongoing session), adopt it into the
        tracker so it is extended/closed normally, and close the rest. Returns the
        number of duplicate visits closed. Pass commit=False to fold into the
        caller's transaction (e.g. inside a merge)."""
        rows = (
            await db.execute(
                select(Visit)
                .where(Visit.left_at.is_(None))
                .order_by(Visit.visitor_id, Visit.entered_at.asc())
            )
        ).scalars().all()

        by_visitor: Dict[UUID, list] = {}
        for v in rows:
            by_visitor.setdefault(v.visitor_id, []).append(v)

        closed = 0
        async with self._lock:
            for visitor_id, visits in by_visitor.items():
                if len(visits) <= 1:
                    continue
                keeper = visits[0]  # earliest entered_at
                # Point the tracker at the keeper so detections extend IT.
                self.active_visits[visitor_id] = ActiveVisit(
                    visit_id=keeper.id,
                    visitor_id=visitor_id,
                    started_at=keeper.entered_at,
                    last_detected_at=keeper.updated_at or keeper.entered_at,
                    detection_count=keeper.detection_count or 0,
                    best_confidence=keeper.best_face_confidence or 0.0,
                    sum_confidence=(keeper.avg_face_confidence or 0.0)
                    * (keeper.detection_count or 0),
                    camera_id=keeper.camera_id,
                )
                for v in visits[1:]:
                    left_at = v.updated_at or v.entered_at
                    duration = max(
                        0, int((left_at - v.entered_at).total_seconds() // 60)
                    )
                    await db.execute(
                        update(Visit)
                        .where(Visit.id == v.id)
                        .values(left_at=left_at, duration_minutes=duration)
                    )
                    closed += 1

        if closed:
            if commit:
                await db.commit()
            logger.info(
                "Reconciled visits: closed %d duplicate open visit(s).", closed
            )
        return closed

    async def cleanup_stale(self, db: AsyncSession, now: Optional[datetime] = None) -> int:
        """Close visits idle past the cooldown or open past the max duration."""
        now = now or _utcnow()
        cooldown = timedelta(minutes=settings.VISIT_COOLDOWN_MINUTES)
        max_dur = timedelta(hours=settings.MAX_VISIT_DURATION_HOURS)
        closed = 0

        async with self._lock:
            for visitor_id, visit in list(self.active_visits.items()):
                idle = now - visit.last_detected_at
                open_for = now - visit.started_at
                if idle < cooldown and open_for < max_dur:
                    continue

                left_at = visit.last_detected_at
                duration = max(0, int((left_at - visit.started_at).total_seconds() // 60))
                await db.execute(
                    update(Visit)
                    .where(Visit.id == visit.visit_id)
                    .values(left_at=left_at, duration_minutes=duration)
                )
                del self.active_visits[visitor_id]
                closed += 1

        if closed:
            await db.commit()
            logger.info("Closed %d stale visit(s).", closed)
        return closed
