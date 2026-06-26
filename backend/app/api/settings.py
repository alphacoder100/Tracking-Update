"""Read-only settings endpoint — surfaces the active configuration for the
dashboard Settings page. Values are configured via .env and loaded at startup;
this endpoint does not mutate them."""

from fastapi import APIRouter, Security

from app.api import verify_api_key
from app.config import settings
from app.schemas import SettingsResponse

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings(_key: str = Security(verify_api_key)):
    return SettingsResponse(
        returning_face_threshold=settings.RETURNING_FACE_THRESHOLD,
        new_visitor_max_similarity=settings.NEW_VISITOR_MAX_SIMILARITY,
        reject_similarity=settings.REJECT_SIMILARITY,
        ambiguity_margin=settings.AMBIGUITY_MARGIN,
        strong_match_threshold=settings.STRONG_MATCH_THRESHOLD,
        max_faces_per_visitor=settings.MAX_FACES_PER_VISITOR,
        face_quality_cutoff=settings.FACE_QUALITY_CUTOFF,
        visit_cooldown_minutes=settings.VISIT_COOLDOWN_MINUTES,
        max_visit_duration_hours=settings.MAX_VISIT_DURATION_HOURS,
        stale_check_interval_seconds=settings.STALE_CHECK_INTERVAL_SECONDS,
        camera_source=settings.CAMERA_SOURCE,
        camera_fps=settings.CAMERA_FPS,
        frame_dedup_enabled=settings.FRAME_DEDUP_ENABLED,
        visitor_retention_days=settings.VISITOR_RETENTION_DAYS,
    )
