"""Camera control endpoints."""

import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, Security, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.security import APIKeyHeader

from app.api import verify_api_key
from app.config import settings
from app.schemas import CameraStartRequest, CameraStatusResponse, RoiRequest, RoiResponse, BoundingBox
from app.services.camera_manager import CameraManager
from app.utils import is_video_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/camera", tags=["camera"])

# Non-erroring header check for the MJPEG stream, which also accepts the key as a
# query param (an <img> tag cannot send custom headers).
_stream_api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)

# Directory for uploaded videos that the camera service streams from.
_VIDEO_UPLOAD_DIR = os.path.join("storage", "uploaded_videos")


@router.post("/start")
async def start_camera(
    request: CameraStartRequest,
    _key: str = Security(verify_api_key),
):
    manager = CameraManager.get_instance()
    try:
        cam = await manager.start(
            source=request.source, camera_id=request.camera_id, fps=request.fps
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "started", "source": cam.source, "camera_id": cam.camera_id}


@router.post("/upload-video")
async def upload_video_stream(
    file: UploadFile = File(...),
    fps: Optional[float] = Form(None),
    loop: bool = Form(False),
    camera_id: Optional[str] = Form(None),
    _key: str = Security(verify_api_key),
):
    """
    Upload a video file and start streaming it through the detection pipeline.

    The file is persisted to disk and a camera service is pointed at it, so the
    annotated feed (with bounding boxes + recognition labels) and the live stats
    apply exactly as they do for a webcam — viewable on the Video Studio / Live
    Monitor pages via the snapshot poller.

    Pass ``camera_id`` to run the video as a specific named camera. This is what
    lets the Video Studio upload two videos at once (an entry-camera video and an
    exit-camera video) so the entry→exit gate tracker can pair them. When omitted
    the default single-camera id is used, preserving the single-stream behaviour.
    """
    if not is_video_upload(file.filename, file.content_type):
        raise HTTPException(status_code=400, detail="File does not look like a video.")

    contents = await file.read()
    max_bytes = settings.VIDEO_MAX_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Video exceeds the {settings.VIDEO_MAX_SIZE_MB} MB limit.",
        )

    os.makedirs(_VIDEO_UPLOAD_DIR, exist_ok=True)
    suffix = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix, dir=_VIDEO_UPLOAD_DIR)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not save upload: {exc}")

    manager = CameraManager.get_instance()
    cid = (camera_id or "").strip() or settings.CAMERA_ID
    existing = manager.get(cid)
    if existing is not None and existing.is_running:
        await manager.stop(cid)

    try:
        cam = await manager.start(
            source=path,
            camera_id=cid,
            fps=fps or settings.CAMERA_FPS,
            loop=loop,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return {
        "status": "streaming",
        "filename": file.filename,
        "source": path,
        "size_mb": round(len(contents) / (1024 * 1024), 2),
        "looping": loop,
        "camera_id": cam.camera_id,
    }


@router.post("/stop")
async def stop_camera(
    camera_id: Optional[str] = Query(None),
    all: bool = Query(False, description="Stop every running camera."),
    _key: str = Security(verify_api_key),
):
    manager = CameraManager.get_instance()
    if all:
        await manager.stop_all()
        return {"status": "stopped", "scope": "all"}
    await manager.stop(camera_id)
    return {"status": "stopped", "camera_id": camera_id or manager.default_id()}


@router.get("/cameras", response_model=list[CameraStatusResponse])
async def list_cameras(_key: str = Security(verify_api_key)):
    """Status of every registered camera — drives the Multicam grid."""
    return [CameraStatusResponse(**s) for s in CameraManager.get_instance().list_status()]


def _idle_status(camera_id: Optional[str]) -> dict:
    """Placeholder status for a camera id that has never been started."""
    return {
        "pipeline": "parallel" if settings.PIPELINE_PARALLEL else "sequential",
        "is_running": False,
        "source": None,
        "source_kind": None,
        "looping": False,
        "camera_id": camera_id or settings.CAMERA_ID,
        "fps": None,
        "frames_processed": 0,
        "frames_skipped": 0,
        "persons_detected": 0,
        "new_visitors": 0,
        "returning_visitors": 0,
        "uptime_seconds": 0.0,
        "last_error": None,
    }


@router.get("/status", response_model=CameraStatusResponse)
async def camera_status(
    camera_id: Optional[str] = Query(None),
    _key: str = Security(verify_api_key),
):
    cam = CameraManager.get_instance().get(camera_id)
    status = cam.status() if cam is not None else _idle_status(camera_id)
    return CameraStatusResponse(**status)


@router.get("/snapshot")
async def camera_snapshot(
    annotated: bool = True,
    camera_id: Optional[str] = Query(None),
    _key: str = Security(verify_api_key),
):
    cam = CameraManager.get_instance().get(camera_id)
    if cam is not None:
        # Mark the feed as actively watched so the display loop keeps encoding
        # preview frames. Without recent requests it auto-idles to save CPU.
        await cam.note_view_request()
    jpeg = cam.snapshot_jpeg(annotated=annotated) if cam is not None else None
    if jpeg is None:
        raise HTTPException(status_code=404, detail="No frame available yet.")
    return Response(content=jpeg, media_type="image/jpeg")


@router.get("/stream")
async def camera_stream(
    camera_id: Optional[str] = Query(None),
    api_key: Optional[str] = Query(None, description="API key (for <img> tags that can't set headers)"),
    header_key: Optional[str] = Security(_stream_api_key_header),
):
    """
    Live MJPEG push stream (multipart/x-mixed-replace). Frames are pushed to the
    client the moment the pipeline produces them — usable directly as an
    `<img src="/api/camera/stream?api_key=...">` source.

    Auth accepts either the x-api-key header or an `api_key` query param, since a
    browser <img> tag cannot send custom headers.
    """
    provided = header_key or api_key
    if not provided or provided != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key.")

    cam = CameraManager.get_instance().get(camera_id)
    if cam is None or not cam.is_running:
        raise HTTPException(status_code=409, detail="Camera is not running.")

    return StreamingResponse(
        cam.mjpeg_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store", "Connection": "close"},
    )


@router.post("/roi", response_model=RoiResponse)
async def set_roi(
    body: RoiRequest,
    camera_id: Optional[str] = Query(None),
    _key: str = Security(verify_api_key),
):
    cam = CameraManager.get_instance().get_or_create(camera_id)
    cam.roi = body.roi.model_dump() if body.roi else None
    return RoiResponse(roi=body.roi)


@router.get("/roi", response_model=RoiResponse)
async def get_roi(
    camera_id: Optional[str] = Query(None),
    _key: str = Security(verify_api_key),
):
    cam = CameraManager.get_instance().get(camera_id)
    roi = cam.roi if cam is not None else None
    return RoiResponse(
        roi=BoundingBox(**roi) if roi else None
    )
