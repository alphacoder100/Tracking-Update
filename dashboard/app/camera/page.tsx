"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Play, RefreshCcw, Square, Video } from "lucide-react";

import { api, fetcher, imageUrl } from "@/lib/api";
import type {
  CameraStatus,
  RoiResponse,
  RegionOfInterest,
  VisitorListResponse,
} from "@/lib/types";
import { Badge, Button, Card, CardTitle, ErrorState } from "@/components/ui";
import { CameraTopologyManager } from "@/components/camera-topology";
import { uptime } from "@/lib/format";

export default function CameraPage() {
  const { mutate: globalMutate } = useSWRConfig();

  // Which camera the snapshot / status / detection-zone controls act on. Each
  // camera (e.g. an entry and an exit) keeps its OWN zone server-side, so the
  // selector lets you draw a separate region for each.
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const camQS = selectedCam ? `?camera_id=${encodeURIComponent(selectedCam)}` : "";

  const { data: cameras } = useSWR<CameraStatus[]>("camera/cameras", fetcher, {
    refreshInterval: 5000,
  });
  const { data: status, error, mutate } = useSWR<CameraStatus>(
    `camera/status${camQS}`,
    fetcher,
    { refreshInterval: 3000 },
  );
  const { data: roiData } = useSWR<RoiResponse>(`camera/roi${camQS}`, fetcher);
  // All-time registered visitor count (active, non-staff); limit=1 → just the total.
  const { data: visitorList } = useSWR<VisitorListResponse>(
    "visitors?limit=1",
    fetcher,
    { refreshInterval: 5000 },
  );

  const [source, setSource] = useState("0");
  const [cameraId, setCameraId] = useState("");
  const [fps, setFps] = useState("1.0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [snapTick, setSnapTick] = useState(Date.now());

  // ROI drawing state
  const [roi, setRoi] = useState<RegionOfInterest | null>(null);
  const [savedRoi, setSavedRoi] = useState<RegionOfInterest | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Default the selector to the first running camera (else the first known one).
  useEffect(() => {
    if (selectedCam || !cameras || cameras.length === 0) return;
    const pick = cameras.find((c) => c.is_running) ?? cameras[0];
    if (pick?.camera_id) setSelectedCam(pick.camera_id);
  }, [cameras, selectedCam]);

  // Switching cameras: drop the previous camera's zone immediately so it never
  // bleeds onto another feed; the per-camera ROI fetch repopulates it below.
  useEffect(() => {
    setRoi(null);
    setSavedRoi(null);
  }, [selectedCam]);

  // Load the selected camera's saved ROI (or clear it when that camera has none).
  useEffect(() => {
    if (roiData) setSavedRoi(roiData.roi ?? null);
  }, [roiData]);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ camera_id?: string }>("camera/start", {
        source,
        camera_id: cameraId || undefined,
        fps: parseFloat(fps),
      });
      if (res?.camera_id) setSelectedCam(res.camera_id);
      await Promise.all([mutate(), globalMutate("camera/cameras")]);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post(`camera/stop${camQS}`);
      await Promise.all([mutate(), globalMutate("camera/cameras")]);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function getImgRect(img: HTMLImageElement) {
    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;
    const scale = Math.min(scaleX, scaleY);
    const rw = img.naturalWidth * scale;
    const rh = img.naturalHeight * scale;
    return {
      offsetX: (img.clientWidth - rw) / 2,
      offsetY: (img.clientHeight - rh) / 2,
      scale,
    };
  }

  function canvasToImage(cx: number, cy: number) {
    if (!imgRef.current) return { x: cx, y: cy };
    const { offsetX, offsetY, scale } = getImgRect(imgRef.current);
    return {
      x: Math.round((cx - offsetX) / scale),
      y: Math.round((cy - offsetY) / scale),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current || !imgRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setStartPt({ x: cx, y: cy });
    setDrawing(true);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing || !startPt || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const x1 = Math.min(startPt.x, cx);
    const y1 = Math.min(startPt.y, cy);
    const x2 = Math.max(startPt.x, cx);
    const y2 = Math.max(startPt.y, cy);

    const topLeft = canvasToImage(x1, y1);
    const botRight = canvasToImage(x2, y2);
    setRoi({
      x1: topLeft.x,
      y1: topLeft.y,
      x2: botRight.x,
      y2: botRight.y,
    });
  }

  function handleMouseUp() {
    setDrawing(false);
  }

  async function saveRoi() {
    if (!roi) return;
    try {
      await api.post(`camera/roi${camQS}`, { roi });
      setSavedRoi(roi);
      setRoi(null);
    } catch (e) {
      alert("Failed to save ROI: " + (e as Error).message);
    }
  }

  async function clearRoi() {
    try {
      await api.post(`camera/roi${camQS}`, { roi: null });
      setSavedRoi(null);
      setRoi(null);
    } catch (e) {
      alert("Failed to clear ROI: " + (e as Error).message);
    }
  }

  // Paint the overlay: the saved zone (solid blue) and the pending one being
  // drawn (dashed amber). The pending box stays on screen after the mouse is
  // released — until you Save or Clear — so you can actually see what you picked.
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!img.naturalWidth) return; // snapshot not loaded yet
    const { offsetX, offsetY, scale } = getImgRect(img);

    const drawBox = (
      r: RegionOfInterest,
      stroke: string,
      fill: string,
      dashed: boolean,
      label: string,
    ) => {
      const x = offsetX + Math.min(r.x1, r.x2) * scale;
      const y = offsetY + Math.min(r.y1, r.y2) * scale;
      const w = Math.abs(r.x2 - r.x1) * scale;
      const h = Math.abs(r.y2 - r.y1) * scale;

      // Dim everything OUTSIDE the zone so the selection reads at a glance.
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill("evenodd");
      ctx.restore();

      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Corner handles.
      ctx.fillStyle = stroke;
      for (const [hx, hy] of [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ] as const) {
        ctx.fillRect(hx - 3, hy - 3, 6, 6);
      }

      // Label chip above the box (or just inside if there's no room above).
      if (label) {
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        const padX = 6;
        const tw = ctx.measureText(label).width;
        const ly = y > 20 ? y - 18 : y + 2;
        ctx.fillStyle = stroke;
        ctx.fillRect(x, ly, tw + padX * 2, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + padX, ly + 12);
      }
    };

    // Show the pending selection if one is being/has been drawn; otherwise the
    // saved zone. (When drawing a replacement, the pending box takes over.)
    if (roi) {
      const w = Math.abs(roi.x2 - roi.x1);
      const h = Math.abs(roi.y2 - roi.y1);
      drawBox(roi, "rgb(245, 158, 11)", "rgba(245, 158, 11, 0.12)", true, `New zone · ${w}×${h}`);
    } else if (savedRoi) {
      drawBox(savedRoi, "rgb(59, 130, 246)", "rgba(59, 130, 246, 0.12)", false, "Detection zone");
    }
  }, [roi, savedRoi]);

  // Keep the canvas buffer matched to the rendered image, then repaint. Runs on
  // image (re)load, snapshot refresh, window resize, and any overlay change.
  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const sync = () => {
      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;
      drawOverlay();
    };

    img.addEventListener("load", sync);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      img.removeEventListener("load", sync);
      window.removeEventListener("resize", sync);
    };
  }, [snapTick, status?.is_running, drawOverlay]);

  const running = !!status?.is_running;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Camera Management</h1>

      {error && <ErrorState message="Could not reach the backend camera API." />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Camera Source</CardTitle>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-text-secondary">Source (0 = webcam, rtsp://…, or file path)</span>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={running}
                className="mt-1 w-full rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">Camera ID (optional — name this camera)</span>
              <input
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={running}
                placeholder="cam-0"
                className="mt-1 w-full rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-secondary">FPS</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                disabled={running}
                className="mt-1 w-28 rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="success" onClick={start} disabled={busy || running}>
                <Play className="h-4 w-4" /> Start
              </Button>
              <Button variant="danger" onClick={stop} disabled={busy || !running}>
                <Square className="h-4 w-4" /> Stop
              </Button>
            </div>
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>Status</CardTitle>
          <dl className="space-y-2 text-sm">
            <Row label="State">
              {running ? <Badge tone="success">Running</Badge> : <Badge tone="danger">Stopped</Badge>}
            </Row>
            <Row label="Source">{status?.source ?? "—"}</Row>
            <Row label="FPS">{status?.fps ?? "—"}</Row>
            <Row label="Uptime">{status ? uptime(status.uptime_seconds) : "—"}</Row>
            <Row label="Frames processed">{status?.frames_processed ?? 0}</Row>
            <Row label="Frames skipped (dedup)">{status?.frames_skipped ?? 0}</Row>
            <Row label="Persons detected">{status?.persons_detected ?? 0}</Row>
            <Row label="Registered visitors">{visitorList?.total ?? "—"}</Row>
            <Row label="New / Returning (session)">
              {status ? `${status.new_visitors} / ${status.returning_visitors}` : "—"}
            </Row>
            {status?.last_error && <Row label="Last error"><span className="text-danger">{status.last_error}</span></Row>}
          </dl>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Latest Snapshot</CardTitle>
          <Button variant="ghost" onClick={() => setSnapTick(Date.now())}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Per-camera selector — each camera keeps its own detection zone. */}
        {cameras && cameras.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Detection zone for</span>
            {cameras.map((c) => {
              const active = c.camera_id === selectedCam;
              return (
                <button
                  key={c.camera_id ?? "default"}
                  type="button"
                  onClick={() => setSelectedCam(c.camera_id ?? null)}
                  className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                    active
                      ? "bg-gradient-primary-soft text-text-primary ring-primary/30"
                      : "bg-white/5 text-text-secondary ring-white/10 hover:text-text-primary"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      c.is_running ? "bg-success" : "bg-text-muted"
                    }`}
                  />
                  <Video className="h-3 w-3" />
                  {c.camera_id ?? "default"}
                </button>
              );
            })}
          </div>
        )}

        {running && (
          <p className="mb-2 text-xs text-text-muted">
            Drag a rectangle on the snapshot to draw a detection zone — only
            people inside it are tracked. The box stays highlighted until you
            <span className="text-text-secondary"> Save</span> or
            <span className="text-text-secondary"> Discard</span> it.
          </p>
        )}

        <div className="overflow-hidden rounded-card border border-card/60 bg-black">
          {running ? (
            <div className="relative inline-block w-full select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={`${imageUrl("camera/snapshot")}?t=${snapTick}${
                  selectedCam ? `&camera_id=${encodeURIComponent(selectedCam)}` : ""
                }`}
                alt="Latest camera snapshot"
                draggable={false}
                className="mx-auto max-h-[480px] object-contain w-full"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-text-secondary">
              Start the camera to see a snapshot.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="success" onClick={saveRoi} disabled={!roi}>
            Save Detection Zone
          </Button>
          {roi && (
            <Button variant="ghost" onClick={() => setRoi(null)}>
              Discard
            </Button>
          )}
          <Button variant="danger" onClick={clearRoi} disabled={!savedRoi || !!roi}>
            Clear Zone
          </Button>
          <span className="ml-auto text-xs text-text-muted">
            {roi
              ? `Unsaved zone · ${Math.abs(roi.x2 - roi.x1)}×${Math.abs(roi.y2 - roi.y1)} px`
              : savedRoi
                ? "Saved zone active"
                : "No zone — tracking the full frame"}
          </span>
        </div>
      </Card>

      <CameraTopologyManager />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-card/30 pb-1.5">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
