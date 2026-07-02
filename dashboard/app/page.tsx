"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Activity as ActivityIcon,
  Clock,
  Cpu,
  DoorOpen,
  Film,
  Layers,
  Maximize2,
  Radio,
  Repeat,
  SkipForward,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { fetcher } from "@/lib/api";
import type {
  ActivityResponse,
  AnalyticsSummary,
  CameraStatus,
  GateStats,
} from "@/lib/types";
import { DetectionFeed } from "@/components/detection-feed";
import { ActivityFeed } from "@/components/activity-feed";
import { StatCard } from "@/components/stat-card";
import { GateActivity } from "@/components/gate-activity";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { formatDuration, uptime } from "@/lib/format";

/** Small label/value row used in the live-session panel. */
function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control bg-white/[0.02] px-3 py-2.5 ring-1 ring-inset ring-white/[0.04]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-white/5 text-text-secondary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
        <p className="tnum truncate text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );
}

/** Compact metric used under each camera feed. */
function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control bg-white/[0.02] px-2.5 py-1.5 text-center ring-1 ring-inset ring-white/[0.04]">
      <p className="tnum text-base font-semibold text-text-primary">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

type CamTone = "success" | "primary";

/** One labelled camera feed (Entry / Exit) with its own live status + per-camera
 *  counters, so a two-camera gate can be monitored side by side. Clicking the
 *  feed opens an enlarged ("zoomed") view via `onZoom`. */
function CameraPanel({
  role,
  cameraId,
  tone,
  onZoom,
}: {
  role: string;
  cameraId: string;
  tone: CamTone;
  onZoom?: () => void;
}) {
  const [st, setSt] = useState<CameraStatus | null>(null);
  const running = !!st?.is_running;
  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={running ? tone : "neutral"} dot>
            {role}
          </Badge>
          <span className="font-mono text-xs text-text-muted">{cameraId}</span>
        </div>
        <span className="text-xs text-text-muted">
          {running ? `${st?.fps ?? "—"} fps` : "offline"}
        </span>
      </div>
      <button
        type="button"
        onClick={onZoom}
        aria-label={`Zoom ${role} camera`}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-card"
      >
        <DetectionFeed cameraId={cameraId} onStatus={setSt} />
        {/* Hover affordance — tells the user the feed is clickable to enlarge. */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/20">
            <Maximize2 className="h-3.5 w-3.5" /> Click to zoom
          </span>
        </span>
      </button>
      <div className="grid grid-cols-3 gap-2">
        <MiniMetric label="Persons" value={st?.persons_detected ?? 0} />
        <MiniMetric label="New" value={st?.new_visitors ?? 0} />
        <MiniMetric label="Returning" value={st?.returning_visitors ?? 0} />
      </div>
    </Card>
  );
}

/** Full-screen enlarged view of a single camera feed. Close via the X button,
 *  the backdrop, or Escape. Polls a touch faster since it's the focused view. */
function ZoomModal({
  role,
  cameraId,
  tone,
  onClose,
}: {
  role: string;
  cameraId: string;
  tone: CamTone;
  onClose: () => void;
}) {
  const [st, setSt] = useState<CameraStatus | null>(null);
  const running = !!st?.is_running;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone={running ? tone : "neutral"} dot>
              {role}
            </Badge>
            <span className="font-mono text-xs text-text-muted">{cameraId}</span>
            <span className="text-xs text-text-muted">
              {running ? `${st?.fps ?? "—"} fps` : "offline"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close zoom"
            className="rounded-control p-2 text-text-muted transition hover:bg-white/10 hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <DetectionFeed cameraId={cameraId} onStatus={setSt} pollMs={250} defaultStreaming />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MiniMetric label="Persons" value={st?.persons_detected ?? 0} />
          <MiniMetric label="New" value={st?.new_visitors ?? 0} />
          <MiniMetric label="Returning" value={st?.returning_visitors ?? 0} />
        </div>
      </div>
    </div>
  );
}

export default function LiveMonitorPage() {
  const [cam, setCam] = useState<CameraStatus | null>(null);
  // The camera currently enlarged in the zoom modal (null = none).
  const [zoom, setZoom] = useState<{
    role: string;
    cameraId: string;
    tone: CamTone;
  } | null>(null);

  const { data: activity } = useSWR<ActivityResponse>("activity?limit=12", fetcher, {
    refreshInterval: 5000,
  });
  const { data: gate } = useSWR<GateStats>("analytics/gate", fetcher, {
    refreshInterval: 5000,
  });
  const { data: summary } = useSWR<AnalyticsSummary>("analytics/summary", fetcher, {
    refreshInterval: 30000,
  });

  const running = !!cam?.is_running;
  const isVideo = cam?.source_kind === "video";

  // Show the entrance and exit feeds side by side whenever both are configured
  // (ENTRY_CAMERA_ID / EXIT_CAMERA_ID), so a gate can be monitored at a glance.
  const entryCam = gate?.entry_camera_id || null;
  const exitCam = gate?.exit_camera_id || null;
  const dualCam = !!(entryCam && exitCam && entryCam !== exitCam);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Real-time"
        title="Live Monitor"
        subtitle="Live feed with on-frame recognition labels."
        icon={<Radio className="h-5 w-5" />}
        action={
          dualCam ? (
            <Badge tone="primary" dot>
              Entry + Exit
            </Badge>
          ) : (
            <Badge tone={running ? "success" : "neutral"} dot>
              {running ? (isVideo ? "Streaming" : "Live") : "Offline"}
            </Badge>
          )
        }
      />

      {/* ── KPI strip (all-time analytics) ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Unique Visitors"
          value={summary?.total_unique_visitors ?? "—"}
          hint="all time"
          icon={<Users className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Total Visits"
          value={summary?.total_visits ?? "—"}
          hint={
            summary
              ? `${summary.new_visitors} new · ${summary.returning_visitors} returning`
              : undefined
          }
          icon={<Layers className="h-5 w-5" />}
          tone="accent"
        />
        <StatCard
          label="Return Rate"
          value={summary ? `${Math.round(summary.return_rate * 100)}%` : "—"}
          hint="returning / unique"
          icon={<Repeat className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Avg Duration"
          value={summary ? formatDuration(Math.round(summary.average_duration_minutes)) : "—"}
          hint="per visit"
          icon={<Clock className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      {/* ── Gate counters (only when entry/exit gate counting is enabled) ── */}
      {gate?.enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Completed Visits (Entry→Exit)"
            value={gate.completed_total}
            hint={`${gate.completed_today} today`}
            icon={<DoorOpen className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Currently Inside"
            value={gate.currently_inside}
            hint={`${gate.entry_camera_id ?? "?"} → ${gate.exit_camera_id ?? "?"}`}
            icon={<Users className="h-5 w-5" />}
            tone="primary"
          />
        </div>
      )}

      {/* ── Hero: dual entry/exit feeds, or single feed + telemetry ── */}
      {dualCam ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CameraPanel
            role="Entry"
            cameraId={entryCam!}
            tone="success"
            onZoom={() =>
              setZoom({ role: "Entry", cameraId: entryCam!, tone: "success" })
            }
          />
          <CameraPanel
            role="Exit"
            cameraId={exitCam!}
            tone="primary"
            onZoom={() =>
              setZoom({ role: "Exit", cameraId: exitCam!, tone: "primary" })
            }
          />
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DetectionFeed onStatus={setCam} />
        </div>

        <Card className="flex flex-col">
          <CardTitle icon={<Cpu className="h-4 w-4" />}>Live Session</CardTitle>
          {running ? (
            <div className="grid flex-1 grid-cols-2 content-start gap-2.5">
              <Metric
                icon={<Film className="h-4 w-4" />}
                label="Processed"
                value={cam?.frames_processed ?? 0}
              />
              <Metric
                icon={<SkipForward className="h-4 w-4" />}
                label="Skipped"
                value={cam?.frames_skipped ?? 0}
              />
              <Metric
                icon={<Users className="h-4 w-4" />}
                label="Persons"
                value={cam?.persons_detected ?? 0}
              />
              <Metric
                icon={<UserPlus className="h-4 w-4" />}
                label="New"
                value={cam?.new_visitors ?? 0}
              />
              <Metric
                icon={<Repeat className="h-4 w-4" />}
                label="Returning"
                value={cam?.returning_visitors ?? 0}
              />
              <Metric
                icon={<Sparkles className="h-4 w-4" />}
                label="FPS"
                value={cam?.fps ?? "—"}
              />
              <div className="col-span-2">
                <Metric
                  icon={<Clock className="h-4 w-4" />}
                  label="Uptime"
                  value={uptime(cam?.uptime_seconds ?? 0)}
                />
              </div>
              {cam?.last_error && (
                <p className="col-span-2 mt-1 rounded-control bg-danger/10 px-3 py-2 text-xs text-danger-bright ring-1 ring-inset ring-danger/20">
                  {cam.last_error}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-card bg-white/5 text-text-muted">
                <Radio className="h-6 w-6" />
              </div>
              <p className="text-sm text-text-secondary">No active stream</p>
              <p className="text-xs text-text-muted">
                Start a camera or stream a video from the Camera page.
              </p>
            </div>
          )}
        </Card>
      </div>
      )}

      {/* ── Gate activity table (when enabled) ── */}
      {gate?.enabled && (
        <Card>
          <CardTitle icon={<DoorOpen className="h-4 w-4" />}>Gate Activity</CardTitle>
          <GateActivity inside={gate.inside ?? []} recent={gate.recent_passes ?? []} />
        </Card>
      )}

      {/* ── Recent recognitions ── */}
      <Card>
        <CardTitle icon={<ActivityIcon className="h-4 w-4" />}>Recent Activity</CardTitle>
        <ActivityFeed events={activity?.events ?? []} />
      </Card>

      {/* ── Enlarged camera view ── */}
      {zoom && (
        <ZoomModal
          role={zoom.role}
          cameraId={zoom.cameraId}
          tone={zoom.tone}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}
