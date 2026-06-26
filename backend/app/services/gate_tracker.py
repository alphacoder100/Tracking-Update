"""
Entry→Exit gate visit tracker — in-memory state machine, persisted to the DB.

A SEPARATE, additive counter from the cooldown-based VisitTracker
(services/visit_tracker.py). A "gate visit" is one directional pass: the SAME
recognized visitor seen on the configured ENTRY camera and then on the EXIT
camera. Cross-camera face re-ID (settings.CROSS_CAMERA_ENABLED) is what makes the
entry-camera and exit-camera sightings resolve to the same visitor_id — this
tracker only consumes the resolved (visitor_id, camera_id) and never touches
identity itself.

State machine (keyed by visitor_id, so repeat per-frame detections de-dup
naturally):
  • ENTRY cam, no open pass       → open a pass (gate_visits row, completed=False).
  • ENTRY cam, pass already open  → refresh last_seen (still at the entrance).
  • EXIT cam, pass open           → close it (completed=True, exited_at) and count.
  • EXIT cam, no open pass         → ignored when GATE_REQUIRE_ENTRY_FIRST.
After a pass closes, a later ENTRY sighting opens a fresh pass (re-entry → +1).

Writes go to the CALLER's DB session (committed by process_detections), so a
gate row and the visitor/visit rows from the same frame commit together and the
gate_visits→visitors foreign key is always satisfied (a brand-new visitor on the
entry camera is only flushed, not yet committed, when the pass opens). The entry
and exit cameras run as independent CameraService loops with separate sessions;
the in-memory open_passes map (guarded by an asyncio lock) is the cross-camera
source of truth for matching an exit to its entry, so an exit never depends on
the entry's row being committed in another session yet.

NOTE: state lives in process memory, so the app must run with a SINGLE worker —
the same constraint documented on VisitTracker. For scale-out, move open_passes
to Redis.
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
from app.models import GateVisit

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class OpenPass:
    gate_visit_id: UUID
    visitor_id: UUID
    entry_camera_id: Optional[str]
    entered_at: datetime
    last_seen_at: datetime


class GateVisitTracker:
    """Per-process tracker of open entry→exit passes (keyed by visitor_id)."""

    _instance: Optional["GateVisitTracker"] = None

    def __init__(self):
        self.open_passes: Dict[UUID, OpenPass] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "GateVisitTracker":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def currently_inside(self) -> int:
        """Visitors seen at entry but not yet at exit (open passes)."""
        return len(self.open_passes)

    # ── role resolution ──────────────────────────────────────

    @staticmethod
    def _roles() -> Tuple[Optional[str], Optional[str]]:
        # Folded to lower-case so the configured roles match a running camera
        # case-insensitively (mirrors CameraManager's registry key), e.g. the
        # gate config "CAM-01" matches a camera started as "cam-01".
        entry = (settings.ENTRY_CAMERA_ID or "").strip().lower() or None
        exit_ = (settings.EXIT_CAMERA_ID or "").strip().lower() or None
        return entry, exit_

    @classmethod
    def is_active(cls) -> bool:
        """True when gate counting is enabled and both roles are set + distinct."""
        if not settings.GATE_COUNTING_ENABLED:
            return False
        entry, exit_ = cls._roles()
        return bool(entry and exit_ and entry != exit_)

    # ── recovery ─────────────────────────────────────────────

    async def recover_open(self, db: AsyncSession) -> None:
        """Load still-open passes (exited_at IS NULL, not completed) on startup."""
        try:
            rows = (
                await db.execute(
                    select(GateVisit).where(
                        GateVisit.exited_at.is_(None),
                        GateVisit.completed.is_(False),
                    )
                )
            ).scalars().all()
        except Exception as exc:  # table may not exist yet (pre-migration 012)
            logger.debug("Gate-pass recovery skipped: %s", exc)
            return
        async with self._lock:
            self.open_passes.clear()
            for g in rows:
                self.open_passes[g.visitor_id] = OpenPass(
                    gate_visit_id=g.id,
                    visitor_id=g.visitor_id,
                    entry_camera_id=g.entry_camera_id,
                    entered_at=g.entered_at,
                    last_seen_at=g.entered_at,
                )
        logger.info("Recovered %d open gate pass(es) from DB.", len(self.open_passes))

    # ── main entry point ─────────────────────────────────────

    async def process(
        self,
        db: AsyncSession,
        visitor_id: Optional[UUID],
        camera_id: Optional[str],
        timestamp: datetime,
    ) -> None:
        """Advance the gate state machine for one resolved detection.

        Writes to the caller's session ``db`` (committed by process_detections),
        so the gate row and the visitor/visit rows of the same frame commit
        together — the gate_visits→visitors FK is always satisfied. No-op unless
        gate counting is active and camera_id is the configured entry/exit camera.
        """
        if visitor_id is None or camera_id is None or not self.is_active():
            return
        entry_id, exit_id = self._roles()
        cam_key = camera_id.strip().lower()
        if cam_key not in (entry_id, exit_id):
            return

        async with self._lock:
            if cam_key == entry_id:
                existing = self.open_passes.get(visitor_id)
                if existing is not None:
                    existing.last_seen_at = timestamp  # still at the entrance
                    return
                gate = GateVisit(
                    visitor_id=visitor_id,
                    entry_camera_id=camera_id,
                    entered_at=timestamp,
                    completed=False,
                )
                db.add(gate)
                await db.flush()  # assign PK; the same-txn visitor satisfies the FK
                self.open_passes[visitor_id] = OpenPass(
                    gate_visit_id=gate.id,
                    visitor_id=visitor_id,
                    entry_camera_id=camera_id,
                    entered_at=timestamp,
                    last_seen_at=timestamp,
                )
            else:  # exit camera
                pass_ = self.open_passes.get(visitor_id)
                if pass_ is None:
                    return  # exit without a prior entry → ignore (strict default)
                dwell = max(0.0, (timestamp - pass_.entered_at).total_seconds())
                if (
                    settings.GATE_MIN_DWELL_SECONDS
                    and dwell < settings.GATE_MIN_DWELL_SECONDS
                ):
                    # Too fast to be a real pass (e.g. both cameras see them at
                    # once). Keep the pass open; a later, slower exit completes it.
                    return
                await db.execute(
                    update(GateVisit)
                    .where(GateVisit.id == pass_.gate_visit_id)
                    .values(
                        exit_camera_id=camera_id,
                        exited_at=timestamp,
                        duration_seconds=int(dwell),
                        completed=True,
                    )
                )
                del self.open_passes[visitor_id]

    # ── stale cleanup ────────────────────────────────────────

    async def cleanup_stale(self, db: AsyncSession, now: Optional[datetime] = None) -> int:
        """Abandon open passes older than GATE_MAX_DWELL_SECONDS (left uncounted).

        An abandoned pass gets exited_at set (so it leaves the open-recovery set)
        but completed stays False (so it never counts as a completed visit). This
        bounds memory and stops a much-later exit completing a stale entry.
        """
        now = now or _utcnow()
        max_open = timedelta(seconds=max(settings.GATE_MAX_DWELL_SECONDS, 0))
        if max_open.total_seconds() <= 0:
            return 0
        abandoned = 0
        async with self._lock:
            for visitor_id, pass_ in list(self.open_passes.items()):
                if now - pass_.entered_at < max_open:
                    continue
                try:
                    await db.execute(
                        update(GateVisit)
                        .where(GateVisit.id == pass_.gate_visit_id)
                        .values(
                            exited_at=pass_.last_seen_at,
                            duration_seconds=int(
                                (pass_.last_seen_at - pass_.entered_at).total_seconds()
                            ),
                            completed=False,
                        )
                    )
                except Exception as exc:
                    logger.debug("Gate stale-cleanup update skipped: %s", exc)
                    continue
                del self.open_passes[visitor_id]
                abandoned += 1
        if abandoned:
            await db.commit()
            logger.info("Abandoned %d stale gate pass(es).", abandoned)
        return abandoned
