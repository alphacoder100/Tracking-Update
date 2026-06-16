"""Camera control endpoints."""

import logging

from fastapi import APIRouter, HTTPException, Response, Security

from app.api import verify_api_key
from app.schemas import CameraStartRequest, CameraStatusResponse, RoiRequest, RoiResponse, BoundingBox
from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/camera", tags=["camera"])


@router.post("/start")
async def start_camera(
    request: CameraStartRequest,
    _key: str = Security(verify_api_key),
):
    cam = CameraService.get_instance()
    try:
        await cam.start(source=request.source, camera_id=request.camera_id, fps=request.fps)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "started", "source": cam.source}


@router.post("/stop")
async def stop_camera(_key: str = Security(verify_api_key)):
    cam = CameraService.get_instance()
    await cam.stop()
    return {"status": "stopped"}


@router.get("/status", response_model=CameraStatusResponse)
async def camera_status(_key: str = Security(verify_api_key)):
    return CameraStatusResponse(**CameraService.get_instance().status())


@router.get("/snapshot")
async def camera_snapshot(
    annotated: bool = True,
    _key: str = Security(verify_api_key),
):
    jpeg = CameraService.get_instance().snapshot_jpeg(annotated=annotated)
    if jpeg is None:
        raise HTTPException(status_code=404, detail="No frame available yet.")
    return Response(content=jpeg, media_type="image/jpeg")


@router.post("/roi", response_model=RoiResponse)
async def set_roi(
    body: RoiRequest,
    _key: str = Security(verify_api_key),
):
    cam = CameraService.get_instance()
    cam.roi = body.roi.model_dump() if body.roi else None
    return RoiResponse(roi=body.roi)


@router.get("/roi", response_model=RoiResponse)
async def get_roi(_key: str = Security(verify_api_key)):
    cam = CameraService.get_instance()
    roi = cam.roi
    return RoiResponse(
        roi=BoundingBox(**roi) if roi else None
    )
