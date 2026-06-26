"use client";

import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  CloudUpload,
  DoorOpen,
  Loader2,
  LogIn,
  LogOut,
  Repeat,
  ScanFace,
  Square,
  UsersRound,
} from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type { CameraStatus, GateStats, VideoStreamResponse } from "@/lib/types";
import { DetectionFeed } from "@/components/detection-feed";
import { GateActivity } from "@/components/gate-activity";
import { StatCard } from "@/components/stat-card";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  PageHeader,
  Select,
  Toggle,
} from "@/components/ui";

const ACCEPT = ".mp4,.avi,.mov,.mkv,.webm";

// Fixed camera ids the two uploaded videos stream as. The entry→exit gate
// tracker is configured (on Start) to pair these two, so the same person seen in
// the entry video and later the exit video is counted as one completed visit.
const ENTRY_CAM = "entry-cam";
const EXIT_CAM = "exit-cam";

type Role = "entry" | "exit";

export default function VideoStudioPage() {
  // Two upload slots. Each has a file + a role; the two roles are mutually
  // exclusive, so we only track slot A's role and derive slot B's from it.
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [roleA, setRoleA] = useState<Role>("entry");
  const roleB: Role = roleA === "entry" ? "exit" : "entry";

  const [fps, setFps] = useState("2");
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [entryStatus, setEntryStatus] = useState<CameraStatus | null>(null);
  const [exitStatus, setExitStatus] = useState<CameraStatus | null>(null);

  const { data: gate, mutate: mutateGate } = useSWR<GateStats>(
    "analytics/gate",
    fetcher,
    { refreshInterval: 3000 },
  );

  const running = Boolean(entryStatus?.is_running || exitStatus?.is_running);

  function uploadOne(file: File, cameraId: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("fps", fps);
    form.append("loop", String(loop));
    form.append("camera_id", cameraId);
    return api.upload<VideoStreamResponse>("camera/upload-video", form);
  }

  async function start() {
    // Map the two slots onto the entry/exit role the user picked for each.
    const entryFile = roleA === "entry" ? fileA : fileB;
    const exitFile = roleA === "entry" ? fileB : fileA;
    if (!entryFile || !exitFile) {
      setMsg({
        kind: "err",
        text: "Upload a video for both the entry and exit streams.",
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Wire up the entry→exit gate so the two videos are paired. Cross-camera
      // matching is what links the same person across the two clips.
      await api.patch("admin/settings", {
        updates: {
          GATE_COUNTING_ENABLED: true,
          ENTRY_CAMERA_ID: ENTRY_CAM,
          EXIT_CAMERA_ID: EXIT_CAM,
          CROSS_CAMERA_ENABLED: true,
        },
      });
      await uploadOne(entryFile, ENTRY_CAM);
      await uploadOne(exitFile, EXIT_CAM);
      setMsg({
        kind: "ok",
        text: "Both streams are running — entry → exit counting is live.",
      });
      await mutateGate();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.post(`camera/stop?camera_id=${encodeURIComponent(ENTRY_CAM)}`);
      await api.post(`camera/stop?camera_id=${encodeURIComponent(EXIT_CAM)}`);
      setMsg(null);
      await mutateGate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Video Studio"
        subtitle="Upload two videos — an entry-camera clip and an exit-camera clip — and run them through face & body detection to count entry → exit visits."
        action={
          running ? (
            <Button variant="danger" onClick={stop} disabled={busy}>
              <Square className="h-4 w-4" /> Stop both
            </Button>
          ) : undefined
        }
      />

      {/* Upload slots */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UploadSlot
          title="Stream A"
          role={roleA}
          onRoleChange={setRoleA}
          file={fileA}
          onFile={setFileA}
        />
        <UploadSlot
          title="Stream B"
          role={roleB}
          // Picking a role for B sets A to the opposite (roles stay distinct).
          onRoleChange={(r) => setRoleA(r === "entry" ? "exit" : "entry")}
          file={fileB}
          onFile={setFileB}
        />
      </div>

      {/* Shared controls */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary">Processing FPS</label>
            <div className="w-20">
              <Input
                type="number"
                value={fps}
                onChange={setFps}
                min={1}
                max={15}
                step={1}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <Repeat className="h-4 w-4" /> Loop videos
            <Toggle checked={loop} onChange={setLoop} />
          </label>
          <Button className="ml-auto" onClick={start} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanFace className="h-4 w-4" />
            )}
            {running ? "Restart both streams" : "Start Detection"}
          </Button>
        </div>
        {msg && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-control p-3 text-xs ${
              msg.kind === "ok"
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            }`}
          >
            {msg.kind === "ok" && (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {msg.text}
          </div>
        )}
      </Card>

      {/* Live feeds */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FeedCard
          title="Entry stream"
          badge="Entry"
          icon={<LogIn className="h-3 w-3" />}
          tone="success"
          cameraId={ENTRY_CAM}
          onStatus={setEntryStatus}
        />
        <FeedCard
          title="Exit stream"
          badge="Exit"
          icon={<LogOut className="h-3 w-3" />}
          tone="warning"
          cameraId={EXIT_CAM}
          onStatus={setExitStatus}
        />
      </div>

      {/* Entry → exit counting */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Inside now"
          value={gate?.currently_inside ?? "—"}
          hint="entered, not yet exited"
          icon={<DoorOpen className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Completed today"
          value={gate?.completed_today ?? "—"}
          hint="entry → exit visits"
          icon={<UsersRound className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Completed total"
          value={gate?.completed_total ?? "—"}
          hint="all-time"
          icon={<UsersRound className="h-5 w-5" />}
          tone="primary"
        />
      </div>

      <Card>
        <CardTitle
          action={running ? <Badge tone="success">live</Badge> : undefined}
        >
          Entry → Exit Activity
        </CardTitle>
        <GateActivity
          inside={gate?.inside ?? []}
          recent={gate?.recent_passes ?? []}
        />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function UploadSlot({
  title,
  role,
  onRoleChange,
  file,
  onFile,
}: {
  title: string;
  role: Role;
  onRoleChange: (r: Role) => void;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEntry = role === "entry";

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge tone={isEntry ? "success" : "warning"}>
            {isEntry ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
            {isEntry ? "Entry" : "Exit"}
          </Badge>
          <div className="w-24">
            <Select
              value={role}
              onChange={(v) => onRoleChange(v as Role)}
              options={[
                { value: "entry", label: "Entry" },
                { value: "exit", label: "Exit" },
              ]}
            />
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-8 text-center transition ${
          dragOver
            ? "border-primary bg-primary/10"
            : "border-white/10 hover:border-white/20 hover:bg-white/5"
        }`}
      >
        <CloudUpload
          className={`h-8 w-8 ${dragOver ? "text-primary" : "text-text-muted"}`}
        />
        {file ? (
          <div className="space-y-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {file.name}
            </p>
            <p className="text-xs text-text-muted">
              {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              Drop a video here, or click to browse
            </p>
            <p className="text-xs text-text-muted">MP4, MOV, AVI, MKV, WEBM</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </Card>
  );
}

function FeedCard({
  title,
  badge,
  icon,
  tone,
  cameraId,
  onStatus,
}: {
  title: string;
  badge: string;
  icon: React.ReactNode;
  tone: "success" | "warning";
  cameraId: string;
  onStatus: (s: CameraStatus) => void;
}) {
  return (
    <Card>
      <CardTitle
        action={
          <Badge tone={tone}>
            {icon}
            {badge}
          </Badge>
        }
      >
        {title}
      </CardTitle>
      <DetectionFeed cameraId={cameraId} onStatus={onStatus} />
    </Card>
  );
}
