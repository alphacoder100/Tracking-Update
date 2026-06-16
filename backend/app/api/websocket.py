"""WebSocket /ws/live-feed — streams annotated frames + live stats."""

import asyncio
import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import settings
from app.services.camera_service import CameraService
from app.services.visit_tracker import VisitTracker

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/live-feed")
async def live_feed(websocket: WebSocket):
    """Push the latest annotated frame and live stats at the camera FPS."""
    logger.info("WebSocket connection attempt from %s", websocket.client)

    try:
        # Log headers for debugging
        logger.debug("WebSocket headers: origin=%s, host=%s",
                     websocket.headers.get("origin"),
                     websocket.headers.get("host"))

        await websocket.accept()
        logger.info("✓ WebSocket client connected to live-feed")
    except Exception as exc:
        logger.error("✗ Failed to accept WebSocket connection: %s", exc, exc_info=True)
        return

    cam = CameraService.get_instance()
    tracker = VisitTracker.get_instance()
    interval = 1.0 / max(cam.fps or settings.CAMERA_FPS, 0.5)

    try:
        while True:
            jpeg = cam.snapshot_jpeg(annotated=True)
            payload = {
                "type": "frame",
                "is_running": cam.is_running,
                "currently_inside": tracker.current_inside_count(),
                "stats": cam.stats,
                "frame": (
                    "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii")
                    if jpeg is not None
                    else None
                ),
            }
            await websocket.send_json(payload)
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        logger.info("live-feed client disconnected")
    except Exception as exc:
        logger.error("live-feed error: %s", exc, exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
