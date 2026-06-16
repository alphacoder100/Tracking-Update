"""Admin endpoints — merge duplicate visitors, mark staff."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Security
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import verify_api_key
from app.database import get_db
from app.models import DetectionEvent, Visit, Visitor, VisitorFace
from app.schemas import MarkStaffRequest, MergeRequest
from app.services.visit_tracker import VisitTracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/visitors/{visitor_id}/merge")
async def merge_visitor(
    visitor_id: UUID,
    request: MergeRequest,
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_api_key),
):
    """Merge `visitor_id` INTO target_visitor_id, then delete the source."""
    if visitor_id == request.target_visitor_id:
        raise HTTPException(status_code=400, detail="Cannot merge a visitor into itself.")

    source = await db.get(Visitor, visitor_id)
    target = await db.get(Visitor, request.target_visitor_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="Source or target visitor not found.")

    # Re-point all child rows to the target.
    for model, col in (
        (Visit, Visit.visitor_id),
        (VisitorFace, VisitorFace.visitor_id),
        (DetectionEvent, DetectionEvent.visitor_id),
    ):
        await db.execute(
            update(model).where(col == visitor_id).values(visitor_id=request.target_visitor_id)
        )

    merged_visits = await db.scalar(
        select(func.count(Visit.id)).where(Visit.visitor_id == request.target_visitor_id)
    )

    # Recompute target aggregates.
    target.visit_count = (target.visit_count or 0) + (source.visit_count or 0)
    if source.first_seen_at and (not target.first_seen_at or source.first_seen_at < target.first_seen_at):
        target.first_seen_at = source.first_seen_at
    if source.last_seen_at and (not target.last_seen_at or source.last_seen_at > target.last_seen_at):
        target.last_seen_at = source.last_seen_at
    target.total_faces_recorded = (target.total_faces_recorded or 0) + (source.total_faces_recorded or 0)

    # Drop the merged visitor from the in-memory tracker if present.
    tracker = VisitTracker.get_instance()
    tracker.active_visits.pop(visitor_id, None)

    await db.delete(source)
    await db.commit()
    return {"success": True, "merged_into": str(request.target_visitor_id), "merged_visits": merged_visits or 0}


@router.post("/visitors/{visitor_id}/mark-staff")
async def mark_staff(
    visitor_id: UUID,
    request: MarkStaffRequest,
    db: AsyncSession = Depends(get_db),
    _key: str = Security(verify_api_key),
):
    visitor = await db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=404, detail="Visitor not found.")
    visitor.is_staff = request.is_staff
    await db.commit()
    return {"success": True, "visitor_id": str(visitor_id), "is_staff": request.is_staff}
