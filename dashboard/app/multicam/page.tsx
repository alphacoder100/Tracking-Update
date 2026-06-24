"use client";

import { useState } from "react";
import useSWR from "swr";
import { Play, Plus, Square } from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type { CameraStatus } from "@/lib/types";
import { Badge, Button, Card, CardTitle, ErrorState } from "@/components/ui";
import { DetectionFeed } from "@/components/detection-feed";
import { uptime } from "@/lib/format";

export default function MulticamPage() {
  const { data: cameras, error, mutate } = useSWR<CameraStatus[]>(
    "camera/cameras",
    fetcher,
    { refreshInterval: 3000 },
  );

  // New-camera form.
  const [camId, setCamId] = useState("");
  const [source, setSource] = useState("0");
  const [fps, setFps] = useState("1.0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function startCamera() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post("camera/start", {
        source,
        camera_id: camId || undefined,
        fps: parseFloat(fps),
      });
      await mutate();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stopCamera(id: string) {
    try {
      await api.post(`camera/stop?camera_id=${encodeURIComponent(id)}`);
      await mutate();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function stopAll() {
    try {
      await api.post("camera/stop?all=true");
      await mutate();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const list = cameras ?? [];
  const runningCount = list.filter((c) => c.is_running).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Multicam</h1>
        <div className="flex items-center gap-3">
          <Badge tone={runningCount > 0 ? "success" : "danger"}>
            {runningCount} / {list.length} running
          </Badge>
          <Button variant="danger" onClick={stopAll} disabled={runningCount === 0}>
            <Square className="h-4 w-4" /> Stop all
          </Button>
        </div>
      </div>

      {error && <ErrorState message="Could not reach the backend camera API." />}

      <Card>
        <CardTitle>Add a camera</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-text-secondary">Camera ID</span>
            <input
              value={camId}
              onChange={(e) => setCamId(e.target.value)}
              placeholder="cam-rtsp"
              className="mt-1 w-40 rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Source (0 = webcam, rtsp://…, file)</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-72 rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
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
              className="mt-1 w-24 rounded-control border border-card/60 bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <Button variant="success" onClick={startCamera} disabled={busy || !source}>
            <Plus className="h-4 w-4" /> Start
          </Button>
        </div>
        {msg && <p className="mt-2 text-sm text-danger">{msg}</p>}
      </Card>

      {list.length === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-text-secondary">
            No cameras yet. Add one above, or set <code>CAMERAS</code> in the
            backend <code>.env</code> with <code>CAMERA_AUTOSTART=true</code>.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {list.map((cam) => (
            <CameraTile
              key={cam.camera_id ?? cam.source ?? Math.random()}
              cam={cam}
              onStop={() => cam.camera_id && stopCamera(cam.camera_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CameraTile({ cam, onStop }: { cam: CameraStatus; onStop: () => void }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle>{cam.camera_id ?? "—"}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge tone={cam.is_running ? "success" : "danger"}>
            {cam.is_running ? "Running" : "Stopped"}
          </Badge>
          <Button variant="danger" onClick={onStop} disabled={!cam.is_running}>
            <Square className="h-4 w-4" /> Stop
          </Button>
        </div>
      </div>

      {cam.is_running ? (
        <DetectionFeed cameraId={cam.camera_id ?? undefined} />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-card border border-white/10 bg-black text-sm text-text-muted">
          {cam.last_error ? (
            <span className="px-4 text-center text-danger">{cam.last_error}</span>
          ) : (
            "Stopped"
          )}
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
        <Stat label="Source" value={cam.source ?? "—"} />
        <Stat label="FPS" value={cam.fps ?? "—"} />
        <Stat label="Uptime" value={uptime(cam.uptime_seconds)} />
        <Stat label="Frames" value={cam.frames_processed} />
        <Stat label="Persons" value={cam.persons_detected} />
        <Stat label="New / Returning" value={`${cam.new_visitors} / ${cam.returning_visitors}`} />
      </dl>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-card/30 pb-1">
      <dt>{label}</dt>
      <dd className="truncate pl-2 font-medium text-text-primary">{value}</dd>
    </div>
  );
}
