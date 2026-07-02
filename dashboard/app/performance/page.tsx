"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Camera,
  Cpu,
  Database,
  Gauge,
  Image as ImageIcon,
  MemoryStick,
  RefreshCw,
  Ruler,
  Save,
  ScanFace,
  ServerCog,
  Users,
  Zap,
} from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type { AdminSettings, PerfBreakdown, PerfCamera, PerfStage } from "@/lib/types";
import { StatCard } from "@/components/stat-card";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Spinner,
  Toggle,
} from "@/components/ui";

// One fixed color per pipeline stage (matches the design-system palette hexes).
const STAGE_COLOR: Record<string, string> = {
  read: "#64748B", // slate — blocking frame read (I/O wait, not CPU)
  capture: "#94A3B8", // light slate — frame resize (CPU)
  yolo: "#3B82F6", // blue — person detection
  arcface: "#8B5CF6", // violet — face recognition
  face_fallback: "#A78BFA", // light violet — extra face pass
  identity_db: "#F59E0B", // amber — matching + DB
  encode: "#10B981", // emerald — preview encode
};
const STAGE_FALLBACK = "#64748B";

const stageColor = (stage: string) => STAGE_COLOR[stage] ?? STAGE_FALLBACK;

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(1)} ms`;
}

/** Horizontal stacked bar of stage compute share. */
function ShareBar({ stages }: { stages: PerfStage[] }) {
  const shown = stages.filter((s) => s.share_pct > 0);
  if (shown.length === 0) {
    return <div className="h-4 w-full rounded-full bg-white/5" />;
  }
  return (
    <div className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-inset ring-white/10">
      {shown.map((s) => (
        <div
          key={s.stage}
          className="h-full transition-all"
          style={{ width: `${s.share_pct}%`, backgroundColor: stageColor(s.stage) }}
          title={`${s.label}: ${s.share_pct}%`}
        />
      ))}
    </div>
  );
}

function StageRow({ s }: { s: PerfStage }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: stageColor(s.stage) }}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{s.label}</span>
      <span className="tnum w-14 text-right text-xs text-text-muted" title="Average time per call">
        {fmtMs(s.avg_ms)}
      </span>
      <span className="tnum w-16 text-right text-xs text-text-secondary" title="Calls measured">
        {s.calls.toLocaleString()}×
      </span>
      <span
        className="tnum w-14 text-right text-sm font-semibold text-text-primary"
        title="Share of total pipeline compute"
      >
        {s.share_pct}%
      </span>
    </div>
  );
}

function CoreGrid({ cores }: { cores: number[] }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {cores.map((c, i) => {
        const tone =
          c >= 85 ? "#EF4444" : c >= 60 ? "#F59E0B" : c >= 30 ? "#3B82F6" : "#10B981";
        return (
          <div key={i} className="rounded-control bg-white/5 p-2">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] text-text-muted">#{i}</span>
              <span className="tnum text-[11px] font-medium text-text-secondary">
                {c.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, c)}%`, backgroundColor: tone }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CameraCard({ cam }: { cam: PerfCamera }) {
  const top = cam.stages[0];
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-text-muted" />
          <span className="font-medium text-text-primary">{cam.camera_id}</span>
          {cam.is_running != null && (
            <Badge tone={cam.is_running ? "success" : "neutral"} dot>
              {cam.is_running ? "running" : "idle"}
            </Badge>
          )}
        </div>
        <span className="tnum text-xs text-text-muted" title="Core-seconds this camera used per wall-second (×100%)">
          {cam.occupancy_pct}% of a core
        </span>
      </div>

      <ShareBar stages={cam.stages} />

      <div className="mt-2 divide-y divide-white/5">
        {cam.stages.map((s) => (
          <StageRow key={s.stage} s={s} />
        ))}
      </div>

      {(cam.frames_processed != null || cam.frames_skipped != null) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/5 pt-3 text-xs text-text-muted">
          {cam.frames_processed != null && (
            <span>
              Frames: <span className="text-text-secondary">{cam.frames_processed.toLocaleString()}</span>
            </span>
          )}
          {cam.frames_skipped != null && (
            <span>
              Skipped (dedup): <span className="text-text-secondary">{cam.frames_skipped.toLocaleString()}</span>
            </span>
          )}
          {top && (
            <span>
              Heaviest: <span className="text-text-secondary">{top.label}</span>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// Long-side presets (px). Smaller = less resize + lighter YOLO/ArcFace, at some
// cost to recall for small/distant faces. 960 matches the ArcFace detector size.
const FRAME_SIZE_PRESETS = [640, 720, 960, 1280, 1600];

/** Adjust the detection frame size + capture rate live. Both feed the "Frame
 *  resize" / "Frame read" stages above — shrinking the frame is the main lever
 *  for the capture cost (and speeds every downstream stage too). */
function FrameSizeCard() {
  const { data, error, mutate } = useSWR<AdminSettings>("admin/settings", fetcher);
  const [longEdit, setLongEdit] = useState<number | null>(null);
  const [fpsEdit, setFpsEdit] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const serverLong =
    typeof data?.MAX_FRAME_LONG_SIDE === "number" ? data.MAX_FRAME_LONG_SIDE : undefined;
  const serverFps =
    typeof data?.CAPTURE_MAX_FPS === "number" ? data.CAPTURE_MAX_FPS : undefined;

  // Backend too old / setting not exposed — hide rather than render a broken card.
  if (error || (data && serverLong === undefined && serverFps === undefined)) {
    return null;
  }

  const curLong = longEdit ?? serverLong ?? 960;
  const curFps = fpsEdit ?? serverFps ?? 8;
  const dirty =
    (serverLong !== undefined && curLong !== serverLong) ||
    (serverFps !== undefined && curFps !== serverFps);

  async function save() {
    setSaving(true);
    try {
      const updates: Record<string, number> = {};
      if (serverLong !== undefined && curLong !== serverLong)
        updates.MAX_FRAME_LONG_SIDE = curLong;
      if (serverFps !== undefined && curFps !== serverFps)
        updates.CAPTURE_MAX_FPS = curFps;
      await api.patch("admin/settings", { updates });
      await mutate();
      setLongEdit(null);
      setFpsEdit(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardTitle
        icon={<Ruler className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLongEdit(null);
                  setFpsEdit(null);
                }}
              >
                Discard
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </Button>
          </div>
        }
      >
        Frame size & capture rate
      </CardTitle>

      {!data ? (
        <Spinner label="Loading current values…" />
      ) : (
        <div className="space-y-5">
          {/* Detection frame size (long side) */}
          {serverLong !== undefined && (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm text-text-primary">
                  Detection frame size (long side)
                </label>
                <span className="tnum text-xs text-text-muted">{curLong} px</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {FRAME_SIZE_PRESETS.map((px) => (
                  <button
                    key={px}
                    onClick={() => setLongEdit(px)}
                    className={`rounded-control px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition ${
                      curLong === px
                        ? "bg-primary/20 text-primary ring-primary/40"
                        : "bg-white/5 text-text-secondary ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {px}
                  </button>
                ))}
                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    step={16}
                    value={curLong}
                    onChange={(v) => setLongEdit(Number(v))}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Frames are downscaled so the longest side is at most this many pixels
                before inference. Smaller = cheaper resize and lighter YOLO/ArcFace;
                larger keeps small/distant faces detectable. 0 disables the cap.
                Applies immediately.
              </p>
            </div>
          )}

          {/* Capture rate cap */}
          {serverFps !== undefined && (
            <div className="border-t border-white/5 pt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm text-text-primary">Capture rate cap</label>
                <span className="tnum text-xs text-text-muted">
                  {curFps > 0 ? `${curFps} fps` : "uncapped"}
                </span>
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={curFps}
                  onChange={(v) => setFpsEdit(Number(v))}
                />
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Caps how fast the capture loop grabs + resizes frames from a live
                source, so the pipeline stops decoding frames it will drop. 0 =
                uncapped. Takes effect on the next camera (re)start.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PerformancePage() {
  const [auto, setAuto] = useState(true);
  const [resetting, setResetting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<PerfBreakdown>("perf", fetcher, {
    refreshInterval: auto ? 3000 : 0,
  });

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.post("perf/reset");
      await mutate();
    } finally {
      setResetting(false);
    }
  };

  const sys = data?.system;
  const dev = data?.device;
  const overall = data?.overall ?? [];
  const cameras = data?.cameras ?? [];
  const topStage = overall[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="Performance & CPU"
        subtitle="Where the pipeline spends compute — so you can see what's saturating the CPU."
        icon={<Cpu className="h-5 w-5" />}
        action={
          <div className="flex items-center gap-3">
            <Toggle checked={auto} onChange={setAuto} label="Live" />
            <Button variant="ghost" size="sm" onClick={() => mutate()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={resetting}>
              Reset counters
            </Button>
          </div>
        }
      />

      {error && <ErrorState message="Could not load performance data. Is the backend running?" />}
      {isLoading && !data && <Spinner label="Sampling system…" />}

      {sys && dev && (
        <>
          {/* ── Top-line system stats ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="System CPU"
              value={`${sys.cpu_percent}%`}
              hint={`${sys.cpu_count_logical ?? "?"} logical cores`}
              icon={<Cpu className="h-5 w-5" />}
              tone={sys.cpu_percent >= 85 ? "danger" : sys.cpu_percent >= 60 ? "warning" : "success"}
            />
            <StatCard
              label="This process CPU"
              value={sys.process_cpu_percent != null ? `${sys.process_cpu_percent}%` : "—"}
              hint={`${sys.process_threads ?? "?"} threads · ${sys.process_rss_mb ?? "?"} MB`}
              icon={<ServerCog className="h-5 w-5" />}
              tone="primary"
            />
            <StatCard
              label="Memory"
              value={`${sys.memory_percent}%`}
              hint={`${(sys.memory_used_mb / 1024).toFixed(1)} / ${(sys.memory_total_mb / 1024).toFixed(1)} GB`}
              icon={<MemoryStick className="h-5 w-5" />}
              tone={sys.memory_percent >= 85 ? "warning" : "accent"}
            />
            <StatCard
              label="Inference device"
              value={dev.device.toUpperCase()}
              hint={dev.on_cpu ? "running on CPU" : "GPU accelerated"}
              icon={<Zap className="h-5 w-5" />}
              tone={dev.on_cpu ? "warning" : "success"}
            />
          </div>

          {/* ── CPU-on-inference explainer ── */}
          {dev.on_cpu && (
            <Card className="border-l-2 border-warning/50">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-warning/15 text-warning ring-1 ring-inset ring-warning/25">
                  <Gauge className="h-5 w-5" />
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-text-primary">
                    Inference is running on the CPU.
                  </p>
                  <p className="text-text-secondary">
                    YOLO and ArcFace do the heavy math on the CPU cores, and each camera runs its
                    own capture → detect → recognise loop in parallel. With{" "}
                    {dev.torch_threads ?? "several"} compute threads per model across two cameras,
                    that is what pushes an i9 toward full utilisation. The breakdown below shows{" "}
                    <span className="text-text-primary">exactly which stage</span> dominates —
                    typically person detection + face recognition. Moving inference to a CUDA GPU,
                    lowering the detector size, capping FPS, or enabling frame-dedup are the biggest
                    levers.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* ── Where the CPU goes (headline) ── */}
          <Card glow>
            <CardTitle icon={<Cpu className="h-4 w-4" />} action={
              topStage ? (
                <Badge tone="primary">
                  Top: {topStage.label} · {topStage.share_pct}%
                </Badge>
              ) : undefined
            }>
              Where the CPU compute goes
            </CardTitle>

            {overall.length === 0 ? (
              <EmptyState
                message="No pipeline activity measured yet. Start a camera and detections will populate this breakdown."
                icon={<Cpu className="h-6 w-6" />}
              />
            ) : (
              <>
                <ShareBar stages={overall} />
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                  {overall
                    .filter((s) => s.share_pct > 0)
                    .map((s) => (
                      <span key={s.stage} className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: stageColor(s.stage) }}
                        />
                        {s.label}
                      </span>
                    ))}
                </div>

                {/* Column headers */}
                <div className="mt-4 flex items-center gap-3 border-b border-white/5 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  <span className="w-2.5" />
                  <span className="flex-1">Stage</span>
                  <span className="w-14 text-right">Avg</span>
                  <span className="w-16 text-right">Calls</span>
                  <span className="w-14 text-right">Share</span>
                </div>
                <div className="divide-y divide-white/5">
                  {overall.map((s) => (
                    <StageRow key={s.stage} s={s} />
                  ))}
                </div>

                <p className="mt-3 text-xs text-text-muted">
                  Share = fraction of total measured pipeline time spent in each stage since the last
                  reset ({data?.elapsed_s}s window). Avg = mean wall-time per call. This is
                  process-wide across all cameras.
                </p>
              </>
            )}
          </Card>

          {/* ── Adjust frame size + capture rate ── */}
          <FrameSizeCard />

          {/* ── Per-core load ── */}
          <Card>
            <CardTitle
              icon={<Cpu className="h-4 w-4" />}
              action={
                sys.loadavg ? (
                  <span className="tnum text-xs text-text-muted">
                    load {sys.loadavg.map((l) => l.toFixed(1)).join(" · ")}
                  </span>
                ) : undefined
              }
            >
              Per-core utilisation
            </CardTitle>
            {sys.per_core.length > 0 ? (
              <CoreGrid cores={sys.per_core} />
            ) : (
              <p className="text-sm text-text-muted">No per-core data available.</p>
            )}
          </Card>

          {/* ── Per-camera breakdown ── */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-text-secondary">
              <Users className="h-4 w-4 text-text-muted" />
              Per-camera compute
            </h2>
            {cameras.length === 0 ? (
              <EmptyState
                message="No cameras have produced measurements yet."
                icon={<Camera className="h-6 w-6" />}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {cameras.map((cam) => (
                  <CameraCard key={cam.camera_id} cam={cam} />
                ))}
              </div>
            )}
          </div>

          {/* ── Runtime config footnote ── */}
          <Card padding="sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <ScanFace className="h-3.5 w-3.5" /> Device:{" "}
                <span className="text-text-secondary">{dev.device}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" /> Torch threads:{" "}
                <span className="text-text-secondary">{dev.torch_threads ?? "—"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" /> Inference workers:{" "}
                <span className="text-text-secondary">{dev.inference_workers}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Pipeline:{" "}
                <span className="text-text-secondary">
                  {dev.pipeline_parallel ? "parallel" : "sequential"}
                </span>
              </span>
              {dev.omp_num_threads && (
                <span>
                  OMP_NUM_THREADS:{" "}
                  <span className="text-text-secondary">{dev.omp_num_threads}</span>
                </span>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
