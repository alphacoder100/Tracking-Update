"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Gauge,
  GitMerge,
  Layers,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  XCircle,
} from "lucide-react";

import { fetcher } from "@/lib/api";
import type {
  AdminSettings,
  ConfidenceWeightedSummary,
  DetectionQuality,
  DeviceStatus,
  EmbeddingCentroid,
  EmbeddingDiagnostics,
  HealthResponse,
  PipelineQuality,
  ReviewFlag,
} from "@/lib/types";
import { DetectionQualityBar, EmbeddingScatter, MonthlyBar } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Badge, Button, Card, CardTitle, PageHeader } from "@/components/ui";
import { relativeTime, shortId } from "@/lib/format";

type RangeKey = "today" | "week" | "month";

function sinceFor(key: RangeKey): string {
  const d = new Date();
  if (key === "today") d.setHours(0, 0, 0, 0);
  else if (key === "week") d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString();
}

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

export default function AiDiagnosticsPage() {
  const [range, setRange] = useState<RangeKey>("week");
  const since = sinceFor(range);

  const { data: health } = useSWR<HealthResponse>("health", fetcher, {
    refreshInterval: 10000,
  });
  const { data: device } = useSWR<DeviceStatus>("admin/device", fetcher, {
    refreshInterval: 15000,
  });
  const { data: quality } = useSWR<DetectionQuality>(
    `analytics/detection-quality?since=${since}`,
    fetcher,
  );
  const { data: summary } = useSWR<ConfidenceWeightedSummary>(
    `analytics/confidence-weighted?since=${since}`,
    fetcher,
  );
  const { data: pipeline } = useSWR<PipelineQuality>(
    `analytics/pipeline-quality?since=${since}`,
    fetcher,
  );
  const { data: settings } = useSWR<AdminSettings>("admin/settings", fetcher);
  const { data: flags } = useSWR<ReviewFlag[]>(
    "admin/review-queue?limit=50",
    fetcher,
    { refreshInterval: 20000 },
  );
  // Vector-DB diagnostics — heavier + fairly static, so no auto-refresh.
  const { data: emb } = useSWR<EmbeddingDiagnostics>("analytics/embeddings", fetcher);

  const cw = summary?.confidence_weighted;
  const reviewCount = flags?.length ?? 0;
  const totalDetections = pipeline?.total_detections ?? quality?.total_detections;

  const GALLERY_BUCKETS = ["0-1", "2-5", "6-10", "11-20", "21+"];
  const gallerySizeData = emb
    ? GALLERY_BUCKETS.map((b) => ({
        label: b,
        value: emb.gallery_size_distribution[b] ?? 0,
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="AI Diagnostics"
        subtitle="Face-recognition pipeline health — confidence, match sources, thresholds & flagged matches. Start here when recognition looks off."
        icon={<BrainCircuit className="h-5 w-5" />}
        action={
          <div className="flex gap-1.5 rounded-control bg-white/5 p-1">
            {(["today", "week", "month"] as RangeKey[]).map((k) => (
              <Button
                key={k}
                variant={range === k ? "primary" : "ghost"}
                size="sm"
                onClick={() => setRange(k)}
              >
                {k === "today" ? "Today" : k === "week" ? "Week" : "Month"}
              </Button>
            ))}
          </div>
        }
      />

      {/* ── Recognition engine health ── */}
      <Card>
        <CardTitle icon={<Cpu className="h-4 w-4" />}>Recognition Engine</CardTitle>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <StatusRow
            label="Models loaded"
            ok={!!health?.models_loaded}
            value={health?.models_loaded ? "Ready" : "Loading…"}
          />
          <StatusRow
            label="Face detector (YOLO)"
            ok={!!health?.yolo_loaded}
            value={health?.yolo_loaded ? "Loaded" : "Not loaded"}
          />
          <StatusRow
            label="Face embeddings (ArcFace)"
            ok={!!health?.arcface_loaded}
            value={health?.arcface_loaded ? "Loaded" : "Not loaded"}
          />
          <StatusRow
            label="Processing device"
            ok={(device?.current_device ?? "cpu") === "cuda"}
            neutral
            value={
              device
                ? device.current_device === "cuda"
                  ? `GPU · ${device.gpu_name ?? "CUDA"}`
                  : "CPU"
                : "—"
            }
          />
          {device?.current_device === "cuda" && (
            <StatusRow
              label="GPU memory"
              neutral
              ok
              value={
                device.gpu_memory_mb
                  ? `${Math.round((device.gpu_memory_used_mb ?? 0))} / ${Math.round(
                      device.gpu_memory_mb,
                    )} MB`
                  : "—"
              }
            />
          )}
          <StatusRow
            label="Camera"
            ok={!!health?.camera_running}
            neutral
            value={health?.camera_running ? "Running" : "Stopped"}
          />
        </div>
      </Card>

      {/* ── Headline KPIs ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Detections"
          value={totalDetections != null ? totalDetections.toLocaleString() : "—"}
          hint="in range"
          icon={<ScanFace className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Avg match confidence"
          value={cw ? pct(cw.avg_confidence) : "—"}
          hint="face similarity"
          icon={<Gauge className="h-5 w-5" />}
          tone={
            cw == null
              ? "primary"
              : cw.avg_confidence >= 0.65
                ? "success"
                : cw.avg_confidence >= 0.5
                  ? "warning"
                  : "danger"
          }
        />
        <StatCard
          label="Low-confidence share"
          value={quality ? pct(quality.pct_low) : "—"}
          hint="weak / no face match"
          icon={<ShieldAlert className="h-5 w-5" />}
          tone={
            quality == null
              ? "primary"
              : quality.pct_low >= 0.25
                ? "danger"
                : quality.pct_low >= 0.1
                  ? "warning"
                  : "success"
          }
        />
        <StatCard
          label="Needs review"
          value={flags ? reviewCount : "—"}
          hint="flagged matches"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={reviewCount > 0 ? "warning" : "success"}
        />
      </div>

      {/* ── Confidence quality + match sources ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardTitle icon={<ShieldCheck className="h-4 w-4" />}>
            Recognition Confidence
          </CardTitle>
          <DetectionQualityBar
            high={quality?.bands.high ?? 0}
            medium={quality?.bands.medium ?? 0}
            low={quality?.bands.low ?? 0}
          />
          <p className="mt-2 text-center text-xs text-text-muted">
            {quality
              ? `${quality.total_detections.toLocaleString()} face detections · high ≥0.65, medium ≥0.45`
              : "—"}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle icon={<ScanFace className="h-4 w-4" />}>
            How matches were resolved
          </CardTitle>
          <MatchSources bySource={pipeline?.by_source} />
        </Card>
      </div>

      {/* ── Pipeline decisions ── */}
      <Card>
        <CardTitle icon={<BrainCircuit className="h-4 w-4" />}>
          Pipeline Decisions
        </CardTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Grey-zone held"
            value={pipeline ? pct(pipeline.grey_zone_rate) : "—"}
            hint={
              pipeline
                ? `${pipeline.grey_zone.toLocaleString()} near-misses held`
                : undefined
            }
            tone="warning"
          />
          <StatCard
            label="Ambiguous skipped"
            value={pipeline ? pct(pipeline.ambiguous_rate) : "—"}
            hint={
              pipeline
                ? `${pipeline.ambiguous.toLocaleString()} to avoid false merge`
                : undefined
            }
            tone={
              pipeline && pipeline.ambiguous_rate >= 0.1 ? "danger" : "primary"
            }
          />
          <StatCard
            label="Re-acquired"
            value={
              pipeline
                ? (
                    pipeline.temporal_recoveries +
                    pipeline.cross_camera_recoveries +
                    pipeline.tracklet_recoveries
                  ).toLocaleString()
                : "—"
            }
            hint={
              pipeline
                ? `${pipeline.temporal_recoveries} temporal · ${pipeline.cross_camera_recoveries} cross-cam · ${pipeline.tracklet_recoveries} tracklet`
                : undefined
            }
            tone="accent"
          />
          <StatCard
            label="New registrations"
            value={pipeline ? pipeline.new_registrations.toLocaleString() : "—"}
            hint="first-time faces"
            tone="success"
          />
        </div>
      </Card>

      {/* ── Active matching thresholds ── */}
      <Card>
        <CardTitle
          icon={<Sliders className="h-4 w-4" />}
          action={
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs text-primary-bright hover:underline"
            >
              Tune in Settings <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          Active Matching Thresholds
        </CardTitle>
        <p className="mb-4 text-sm text-text-secondary">
          These govern how a face is matched to an existing visitor. If people are
          being missed or merged incorrectly, check these first.
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <Threshold s={settings} k="RETURNING_FACE_THRESHOLD" label="Returning match ≥" />
          <Threshold s={settings} k="STRONG_MATCH_THRESHOLD" label="Strong match ≥" />
          <Threshold s={settings} k="NEW_VISITOR_MAX_SIMILARITY" label="New visitor ≤" />
          <Threshold s={settings} k="REJECT_SIMILARITY" label="Reject below" />
          <Threshold s={settings} k="AMBIGUITY_MARGIN" label="Ambiguity margin" />
          <Threshold s={settings} k="MIN_FACE_DET_SCORE" label="Min face score" />
          <Threshold s={settings} k="FACE_QUALITY_CUTOFF" label="Quality cutoff" />
          <Threshold s={settings} k="YOLO_PERSON_CONFIDENCE" label="Person conf ≥" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
          <ToggleBadge s={settings} k="CROSS_CAMERA_ENABLED" label="Cross-camera" />
          <ToggleBadge s={settings} k="TRACKLET_ENABLED" label="Tracklet" />
          <ToggleBadge s={settings} k="POSE_AWARE_GALLERY" label="Pose-aware gallery" />
          <ToggleBadge s={settings} k="ADAPTIVE_VISITOR_THRESHOLDS" label="Adaptive thresholds" />
          <ToggleBadge s={settings} k="MASK_DETECTION_ENABLED" label="Mask detection" />
          <ToggleBadge s={settings} k="AUTO_TUNING_ENABLED" label="Auto-tuning" />
        </div>
      </Card>

      {/* ── Flagged matches (review queue) ── */}
      <Card>
        <CardTitle
          icon={<AlertTriangle className="h-4 w-4" />}
          action={
            <Link
              href="/review"
              className="inline-flex items-center gap-1 text-xs text-primary-bright hover:underline"
            >
              Open Review Queue <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          Flagged Matches
        </CardTitle>
        {reviewCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-text-secondary">
            <CheckCircle2 className="h-8 w-8 text-success" />
            No flagged matches — the recognizer isn&apos;t unsure about anyone right now.
          </div>
        ) : (
          <ul className="divide-y divide-card/40">
            {(flags ?? []).map((f) => (
              <FlagRow key={f.id} flag={f} />
            ))}
          </ul>
        )}
      </Card>

      {/* ── Vector DB explorer ── */}
      <div className="pt-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.1em] text-text-secondary">
          <Boxes className="h-4 w-4 text-text-muted" /> Vector DB Explorer
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          The actual face-embedding vectors — projected and compared — to spot
          split identities, contaminated galleries, and confusable people.
        </p>
      </div>

      <Card>
        <CardTitle icon={<Boxes className="h-4 w-4" />}>Embedding Map (PCA)</CardTitle>
        <EmbeddingScatter
          centroids={emb?.centroids ?? []}
          faces={emb?.faces ?? []}
        />
        <p className="mt-2 text-center text-xs text-text-muted">
          {emb
            ? `${emb.visitor_count} visitors · ${emb.face_count.toLocaleString()} gallery faces · PC1+PC2 capture ${pct(
                (emb.explained_variance[0] ?? 0) + (emb.explained_variance[1] ?? 0),
              )} of variance · big ring = centroid, small dot = one face`
            : "—"}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<GitMerge className="h-4 w-4" />}>
            Confusable / Merge Candidates
          </CardTitle>
          <p className="mb-3 text-sm text-text-secondary">
            Distinct visitors whose centroids sit close together — likely the same
            person split in two, or people the recognizer may swap.
          </p>
          {emb && emb.merge_candidates.length > 0 ? (
            <ul className="divide-y divide-card/40">
              {emb.merge_candidates.map((m) => (
                <li
                  key={`${m.a_id}-${m.b_id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={`/visitors/${m.a_id}`}
                      className="truncate font-medium text-text-primary hover:text-primary-bright"
                    >
                      {m.a_name || `Visitor ${shortId(m.a_id)}`}
                    </Link>
                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <Link
                      href={`/visitors/${m.b_id}`}
                      className="truncate font-medium text-text-primary hover:text-primary-bright"
                    >
                      {m.b_name || `Visitor ${shortId(m.b_id)}`}
                    </Link>
                  </div>
                  <Badge tone={m.similarity >= 0.6 ? "danger" : "warning"}>
                    {(m.similarity * 100).toFixed(0)}%
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-text-secondary">
              {emb
                ? "No confusable pairs above 45% — identities look well separated."
                : "—"}
            </p>
          )}
        </Card>

        <Card>
          <CardTitle icon={<ScanFace className="h-4 w-4" />}>Nearest Neighbors</CardTitle>
          <p className="mb-3 text-sm text-text-secondary">
            Each visitor&apos;s closest other identities by face similarity.
          </p>
          <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {(emb?.confusion ?? []).map((c) => (
              <li key={c.visitor_id} className="text-sm">
                <Link
                  href={`/visitors/${c.visitor_id}`}
                  className="font-medium text-text-primary hover:text-primary-bright"
                >
                  {c.name || `Visitor ${shortId(c.visitor_id)}`}
                </Link>
                <span className="ml-2 text-xs text-text-muted">
                  {c.neighbors.length
                    ? c.neighbors
                        .map(
                          (n) =>
                            `${n.name || shortId(n.visitor_id)} ${(n.similarity * 100).toFixed(0)}%`,
                        )
                        .join(" · ")
                    : "—"}
                </span>
              </li>
            ))}
            {(emb?.confusion ?? []).length === 0 && (
              <li className="py-6 text-center text-text-secondary">—</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<ShieldCheck className="h-4 w-4" />}>Gallery Cohesion</CardTitle>
          <p className="mb-3 text-sm text-text-secondary">
            Mean similarity within each visitor&apos;s own gallery. Low (red)
            suggests the gallery mixes more than one person.
          </p>
          <CohesionList centroids={emb?.centroids ?? []} />
        </Card>
        <Card>
          <CardTitle icon={<Layers className="h-4 w-4" />}>
            Gallery Size Distribution
          </CardTitle>
          <MonthlyBar data={gallerySizeData} />
          <p className="mt-1 text-center text-xs text-text-muted">
            visitors by number of stored faces
          </p>
        </Card>
      </div>
    </div>
  );
}

function CohesionList({ centroids }: { centroids: EmbeddingCentroid[] }) {
  const rows = [...centroids]
    .filter((c) => c.gallery_size >= 2 && c.cohesion != null)
    .sort((a, b) => (a.cohesion ?? 1) - (b.cohesion ?? 1));

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        Not enough gallery faces to measure cohesion yet.
      </p>
    );
  }

  return (
    <ul className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
      {rows.map((c) => {
        const v = c.cohesion ?? 0;
        const color = v < 0.3 ? "#EF4444" : v < 0.45 ? "#F59E0B" : "#10B981";
        return (
          <li key={c.visitor_id}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <Link
                href={`/visitors/${c.visitor_id}`}
                className="truncate text-text-secondary hover:text-primary-bright"
              >
                {c.name || `Visitor ${shortId(c.visitor_id)}`}{" "}
                <span className="text-text-muted">({c.gallery_size})</span>
              </Link>
              <span className="tnum text-text-primary">{(v * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-card/40">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, v * 100))}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatusRow({
  label,
  value,
  ok,
  neutral = false,
}: {
  label: string;
  value: React.ReactNode;
  ok: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-card/30 py-2">
      <span className="flex items-center gap-2 text-sm text-text-secondary">
        {neutral ? (
          <span
            className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-text-muted"}`}
          />
        ) : ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-danger" />
        )}
        {label}
      </span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  face: { label: "Direct face match", color: "#10B981" },
  strong_face: { label: "Strong face match", color: "#22C55E" },
  returning: { label: "Returning face match", color: "#10B981" },
  temporal: { label: "Temporal recovery", color: "#3B82F6" },
  cross_camera: { label: "Cross-camera re-ID", color: "#8B5CF6" },
  tracklet: { label: "Tracklet continuity", color: "#06B6D4" },
  grey_zone: { label: "Grey-zone (held)", color: "#F59E0B" },
  new: { label: "New registration", color: "#A3E635" },
  new_visitor: { label: "New registration", color: "#A3E635" },
  none: { label: "Unmatched", color: "#64748B" },
};

const FALLBACK_COLORS = ["#3B82F6", "#8B5CF6", "#06B6D4", "#F59E0B", "#EF4444"];

function MatchSources({ bySource }: { bySource?: Record<string, number> }) {
  const entries = Object.entries(bySource ?? {}).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-secondary">
        No detections in this range.
      </p>
    );
  }
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  entries.sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3 py-1">
      {entries.map(([src, n], i) => {
        const meta = SOURCE_META[src] ?? {
          label: src,
          color: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        };
        const share = (n / total) * 100;
        return (
          <div key={src}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-text-secondary">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
                <span className="font-mono text-text-muted">{src}</span>
              </span>
              <span className="text-text-primary">
                {n.toLocaleString()}{" "}
                <span className="text-text-muted">({share.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-card/40">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${share}%`, backgroundColor: meta.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Threshold({
  s,
  k,
  label,
}: {
  s?: AdminSettings;
  k: string;
  label: string;
}) {
  const raw = s?.[k];
  const value =
    typeof raw === "number"
      ? Number.isInteger(raw)
        ? raw.toString()
        : raw.toFixed(2)
      : raw != null
        ? String(raw)
        : "—";
  return (
    <div className="border-b border-card/30 py-1.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="tnum text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function ToggleBadge({
  s,
  k,
  label,
}: {
  s?: AdminSettings;
  k: string;
  label: string;
}) {
  const on = Boolean(s?.[k]);
  return (
    <Badge tone={on ? "success" : "neutral"} dot>
      {label}: {on ? "on" : "off"}
    </Badge>
  );
}

function FlagRow({ flag }: { flag: ReviewFlag }) {
  const body = (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">{flag.flag_type.replace(/_/g, " ")}</Badge>
          <span className="truncate text-sm font-medium text-text-primary">
            Visitor {shortId(flag.visitor_id)}
          </span>
          {flag.matched_visitor_id && (
            <span className="text-xs text-text-muted">
              ↔ {flag.matched_visitor_name || `Visitor ${shortId(flag.matched_visitor_id)}`}
            </span>
          )}
        </div>
        {flag.detail && (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{flag.detail}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {flag.similarity != null && (
          <p className="tnum text-sm font-semibold text-text-primary">
            {(flag.similarity * 100).toFixed(0)}%
          </p>
        )}
        <p className="text-[11px] text-text-muted">{relativeTime(flag.created_at)}</p>
      </div>
    </div>
  );
  return (
    <li>
      <Link
        href={`/visitors/${flag.visitor_id}`}
        className="block rounded-control px-1 hover:bg-card/20"
      >
        {body}
      </Link>
    </li>
  );
}
