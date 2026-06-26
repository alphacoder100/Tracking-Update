"""Activity feed — recent detection events for the dashboard timeline."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Security
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import verify_api_key
from app.database import get_db
from app.models import DetectionEvent, Visitor
from app.schemas import ActivityEvent, ActivityResponse

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("", response_model=ActivityResponse)
async def list_activity(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    event_type: Optional[str] = Query(
        None, pattern="^(new|returning|ambiguous)$",
        description="Filter by event type",
    ),
    since: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_api_key),
):
    """Most-recent detection events, newest first, with visitor info joined."""
    base = (
        select(DetectionEvent, Visitor.name, Visitor.thumbnail_path)
        .join(Visitor, Visitor.id == DetectionEvent.visitor_id, isouter=True)
    )
    count_q = select(func.count(DetectionEvent.id))

    if event_type == "new":
        base = base.where(DetectionEvent.is_new_visitor.is_(True))
        count_q = count_q.where(DetectionEvent.is_new_visitor.is_(True))
    elif event_type == "ambiguous":
        base = base.where(DetectionEvent.is_ambiguous.is_(True))
        count_q = count_q.where(DetectionEvent.is_ambiguous.is_(True))
    elif event_type == "returning":
        base = base.where(
            DetectionEvent.is_new_visitor.is_(False),
            DetectionEvent.is_ambiguous.is_(False),
            DetectionEvent.visitor_id.isnot(None),
        )
        count_q = count_q.where(
            DetectionEvent.is_new_visitor.is_(False),
            DetectionEvent.is_ambiguous.is_(False),
            DetectionEvent.visitor_id.isnot(None),
        )
    if since is not None:
        base = base.where(DetectionEvent.detected_at >= since)
        count_q = count_q.where(DetectionEvent.detected_at >= since)

    total = await db.scalar(count_q)
    rows = (
        await db.execute(
            base.order_by(DetectionEvent.detected_at.desc()).limit(limit).offset(offset)
        )
    ).all()

    events = []
    for ev, name, thumb in rows:
        events.append(
            ActivityEvent(
                id=ev.id,
                detected_at=ev.detected_at,
                visitor_id=ev.visitor_id,
                visitor_name=name,
                thumbnail_url=(
                    f"/api/visitors/{ev.visitor_id}/thumbnail"
                    if ev.visitor_id and thumb else None
                ),
                visit_id=ev.visit_id,
                face_similarity=ev.face_similarity,
                is_new_visitor=ev.is_new_visitor,
                is_ambiguous=ev.is_ambiguous,
                match_source=ev.match_source,
                camera_id=ev.camera_id,
            )
        )

    return ActivityResponse(total=total or 0, events=events)
