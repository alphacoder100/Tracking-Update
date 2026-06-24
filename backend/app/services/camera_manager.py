"""
Camera registry — runs and tracks multiple CameraService instances concurrently.

Each physical source (USB webcam, RTSP IP camera, video file) gets its own
CameraService keyed by ``camera_id``. The services are fully independent — own
capture, own inference pipeline, own stats — and all inference is bounded by the
process-wide semaphore in ``app.utils`` so concurrent cameras don't thrash the
CPU/GPU. This is what lets an RTSP camera and a local webcam run at the same
time and show up side-by-side in the Multicam view.
"""

import asyncio
import logging
from typing import Optional

from app.config import settings
from app.services.camera_service import CameraService

logger = logging.getLogger(__name__)


def parse_cameras_config(raw: str) -> list[tuple[str, str]]:
    """Parse ``CAMERAS`` ("id=source;id=source") into [(camera_id, source), …].

    Sources may themselves contain '=' (rare in RTSP URLs but possible), so we
    split each pair on the *first* '='. Blank/comment-ish entries are skipped.
    """
    pairs: list[tuple[str, str]] = []
    for chunk in (raw or "").split(";"):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        cid, source = chunk.split("=", 1)
        cid, source = cid.strip(), source.strip()
        if cid and source:
            pairs.append((cid, source))
    return pairs


class CameraManager:
    """Singleton registry of active cameras keyed by ``camera_id``."""

    _instance: Optional["CameraManager"] = None

    def __init__(self):
        self._cameras: dict[str, CameraService] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "CameraManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── lookup ───────────────────────────────────────────────

    def get(self, camera_id: Optional[str]) -> Optional[CameraService]:
        """Resolve a camera by id, falling back to the default when omitted."""
        if camera_id:
            return self._cameras.get(camera_id)
        return self._cameras.get(self.default_id())

    def get_or_create(self, camera_id: Optional[str]) -> CameraService:
        cid = camera_id or self.default_id()
        cam = self._cameras.get(cid)
        if cam is None:
            cam = CameraService(camera_id=cid)
            self._cameras[cid] = cam
        return cam

    def default_id(self) -> str:
        """First running camera, else the configured single-camera id."""
        for cid, cam in self._cameras.items():
            if cam.is_running:
                return cid
        return settings.CAMERA_ID

    def any_running(self) -> bool:
        return any(cam.is_running for cam in self._cameras.values())

    def list_status(self) -> list[dict]:
        return [cam.status() for cam in self._cameras.values()]

    # ── lifecycle ────────────────────────────────────────────

    async def start(
        self,
        source: Optional[str] = None,
        camera_id: Optional[str] = None,
        fps: Optional[float] = None,
        loop: bool = False,
    ) -> CameraService:
        """Start (or restart) a single named camera without touching the others."""
        cid = camera_id or settings.CAMERA_ID
        async with self._lock:
            cam = self._cameras.get(cid)
            if cam is not None and cam.is_running:
                raise RuntimeError(f"Camera '{cid}' is already running.")
            if cam is None:
                cam = CameraService(camera_id=cid)
                self._cameras[cid] = cam
            await cam.start(source=source, camera_id=cid, fps=fps, loop=loop)
            return cam

    async def stop(self, camera_id: Optional[str] = None) -> None:
        cam = self.get(camera_id)
        if cam is not None:
            await cam.stop()

    async def stop_all(self) -> None:
        await asyncio.gather(
            *(cam.stop() for cam in self._cameras.values() if cam.is_running),
            return_exceptions=True,
        )
