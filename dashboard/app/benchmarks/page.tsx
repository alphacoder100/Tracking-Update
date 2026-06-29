"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Activity,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Gauge,
  Loader2,
  Play,
  ScanFace,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type {
  BenchmarkRunStatus,
  Leaderboard,
  LeaderboardEntry,
  ModelStatus,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";

const KIND = "recognition";
const LB_KEY = `admin/benchmarks/leaderboard?kind=${KIND}`;
const RUN_KEY = "admin/benchmarks/run";

const pctOf = (v: unknown) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";
const fix = (d: number) => (v: unknown) =>
  typeof v === "number" ? v.toFixed(d) : "—";

export default function ModelArenaPage() {
  const { mutate } = useSWRConfig();
  const [align, setAlign] = useState<"resize" | "detect">("resize");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: models } = useSWR<ModelStatus>("admin/models", fetcher);
  const { data: lb, error: lbError } = useSWR<Leaderboard>(LB_KEY, fetcher);
  // Poll the run status only while a run is active.
  const { data: run } = useSWR<BenchmarkRunStatus>(RUN_KEY, fetcher, {
    refreshInterval: (latest) => (latest?.status === "running" ? 1500 : 0),
  });

  const running = run?.status === "running";

  // When a run finishes, refresh the leaderboard so new scores appear + stored.
  const lastStatus = run?.status;
  useEffect(() => {
    if (lastStatus === "done" || lastStatus === "error") {
      void mutate(LB_KEY);
      void mutate("admin/models");
    }
  }, [lastStatus, mutate]);

  const evaluated = useMemo(
    () => new Map((lb?.models ?? []).map((m) => [m.model, m])),
    [lb],
  );

  // Rows: evaluated models first (best→worst), then not-yet-evaluated candidates.
  const unevaluated = (lb?.all_candidates ?? []).filter((c) => !evaluated.has(c));
  const activeEntry = lb?.models.find((m) => m.is_active) ?? null;
  const bestEntry = lb?.models.find((m) => m.is_best) ?? null;

  async function evaluate(modelList: string[]) {
    setBusy(modelList.join(","));
    try {
      await api.post(RUN_KEY, { kind: KIND, models: modelList, align, device: "cpu" });
      await mutate(RUN_KEY); // kick the poller immediately
    } catch (e) {
      alert(`Could not start evaluation: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function useModel(model: string) {
    if (model === lb?.active_model) return;
    const faces = models?.gallery_face_count ?? 0;
    const ok = window.confirm(
      `Switch the LIVE recognition model to "${model}"?\n\n` +
        `This changes the embedding space, so the existing ${faces} gallery ` +
        `face(s) must be re-enrolled before returning visitors match again.\n\nProceed?`,
    );
    if (!ok) return;
    setBusy(`use:${model}`);
    try {
      await api.post("admin/models", {
        insightface_model: model,
        confirm_recognition_change: true,
      });
      await Promise.all([mutate("admin/models"), mutate(LB_KEY), mutate("health")]);
      alert(`Now serving ${model}. Rebuild/re-enroll the gallery to restore matching.`);
    } catch (e) {
      alert(`Switch failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function applyThreshold(value: number) {
    setBusy("threshold");
    try {
      await api.patch("admin/settings", {
        updates: { RETURNING_FACE_THRESHOLD: Number(value.toFixed(3)) },
      });
      await mutate("admin/settings");
      alert(`Applied RETURNING_FACE_THRESHOLD = ${value.toFixed(3)}.`);
    } catch (e) {
      alert(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Model selection"
        title="Model Arena"
        subtitle="Score recognition models on your own live gallery, one by one. Results are stored automatically and the best is surfaced — switch to it with one click."
        icon={<FlaskConical className="h-5 w-5" />}
        action={
          <div className="flex items-center gap-2">
            <div className="w-40">
              <Select
                value={align}
                onChange={(v) => setAlign(v as "resize" | "detect")}
                options={[
                  { value: "resize", label: "Fast (resize)" },
                  { value: "detect", label: "Realistic (detect)" },
                ]}
              />
            </div>
            <Button
              disabled={running || !lb}
              onClick={() => evaluate(lb?.all_candidates ?? [])}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Evaluate all
            </Button>
          </div>
        }
      />

      {/* ── Run progress ── */}
      {run && run.status !== "idle" && (
        <RunBanner run={run} />
      )}

      {lbError ? (
        <ErrorState message="Could not load the leaderboard. Is ADMIN_API_KEY configured?" />
      ) : !lb || !models ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          {/* ── Current model scorecard ── */}
          <Card>
            <CardTitle icon={<ScanFace className="h-4 w-4" />}>
              Current Model
            </CardTitle>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-semibold text-text-primary">
                    {lb.active_model}
                  </span>
                  <Badge tone="primary">recognition · live</Badge>
                  {bestEntry && bestEntry.model === lb.active_model && (
                    <Badge tone="success">
                      <Trophy className="h-3 w-3" /> best
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Detector: {models.yolo_model} · device {models.device} ·{" "}
                  {models.gallery_face_count} gallery faces / {models.gallery_visitor_count}{" "}
                  visitors
                </p>
                {activeEntry ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="AUC" value={fix(4)(activeEntry.auc)} tone="primary" />
                    <Metric label="EER" value={pctOf(activeEntry.eer)} />
                    <Metric label="Rec. threshold" value={fix(3)(activeEntry.best_threshold)} />
                    <Metric label="ms / face" value={fix(2)(activeEntry.embed_ms_mean)} />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-text-secondary">
                    Not scored yet — click{" "}
                    <span className="text-text-primary">Evaluate</span> on{" "}
                    {lb.active_model} below to measure it on your live gallery.
                  </p>
                )}
              </div>

              {/* Best-model callout */}
              {bestEntry && (
                <div className="rounded-card border border-success/25 bg-success/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                    <Trophy className="h-3.5 w-3.5" /> Best so far
                  </p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {bestEntry.model}
                  </p>
                  <p className="text-xs text-text-muted">
                    AUC {fix(4)(bestEntry.auc)} · EER {pctOf(bestEntry.eer)} ·{" "}
                    {fix(2)(bestEntry.embed_ms_mean)} ms/face
                  </p>
                  {bestEntry.model !== lb.active_model && (
                    <Button
                      size="sm"
                      className="mt-3"
                      disabled={busy !== null || running}
                      onClick={() => useModel(bestEntry.model)}
                    >
                      <Zap className="h-3.5 w-3.5" /> Use best model
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* ── Leaderboard ── */}
          <Card>
            <CardTitle icon={<Trophy className="h-4 w-4" />}>
              Leaderboard · recognition accuracy on live data
            </CardTitle>
            {lb.models.length === 0 && unevaluated.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">
                No candidate models configured.
              </p>
            ) : (
              <div className="space-y-2">
                {lb.models.map((m, i) => (
                  <ModelRow
                    key={m.model}
                    rank={i + 1}
                    entry={m}
                    active={m.is_active}
                    busy={busy}
                    running={running}
                    onEvaluate={() => evaluate([m.model])}
                    onUse={() => useModel(m.model)}
                    onApply={() => applyThreshold(Number(m.best_threshold))}
                  />
                ))}
                {unevaluated.map((model) => (
                  <ModelRow
                    key={model}
                    entry={{ model } as LeaderboardEntry}
                    active={model === lb.active_model}
                    unevaluated
                    busy={busy}
                    running={running}
                    onEvaluate={() => evaluate([model])}
                    onUse={() => useModel(model)}
                  />
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-text-muted">
              Accuracy is measured against your accumulated gallery crops
              (storage/visitor_photos). Those identities were grouped by the
              current model, so absolute scores are optimistic for it — the ranking
              between candidates is the reliable signal. “Realistic (detect)” mode
              adds face alignment for production-like numbers.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
}) {
  return (
    <div className="rounded-control border border-white/5 bg-white/5 px-3 py-2">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p
        className={`tnum text-lg font-semibold ${
          tone === "primary" ? "text-primary-bright" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ModelRow({
  entry,
  rank,
  active,
  unevaluated = false,
  busy,
  running,
  onEvaluate,
  onUse,
  onApply,
}: {
  entry: LeaderboardEntry;
  rank?: number;
  active: boolean;
  unevaluated?: boolean;
  busy: string | null;
  running: boolean;
  onEvaluate: () => void;
  onUse: () => void;
  onApply?: () => void;
}) {
  const disabled = busy !== null || running;
  const evaluatingThis = busy === entry.model;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-card border px-3 py-2.5 ${
        entry.is_best
          ? "border-success/30 bg-success/5"
          : active
            ? "border-primary/30 bg-primary/5"
            : "border-white/5 bg-white/[0.02]"
      }`}
    >
      <span className="w-6 text-center text-sm font-semibold text-text-muted">
        {unevaluated ? "—" : rank}
      </span>
      <div className="min-w-[8rem]">
        <span className="flex items-center gap-1.5 font-medium text-text-primary">
          {entry.is_best && <Trophy className="h-3.5 w-3.5 text-success" />}
          {entry.model}
        </span>
        <div className="mt-0.5 flex gap-1">
          {active && <Badge tone="primary">live</Badge>}
          {entry.is_best && <Badge tone="success">best</Badge>}
        </div>
      </div>

      {unevaluated ? (
        <span className="text-sm text-text-muted">Not evaluated yet</span>
      ) : (
        <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
          <Stat label="AUC" value={fix(4)(entry.auc)} strong />
          <Stat label="EER" value={pctOf(entry.eer)} />
          <Stat label="thr" value={fix(3)(entry.best_threshold)} />
          <Stat label="ms/face" value={fix(2)(entry.embed_ms_mean)} />
          <Stat label="cov" value={pctOf(entry.coverage)} />
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onEvaluate}>
          {evaluatingThis ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          Evaluate
        </Button>
        {!unevaluated && onApply && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onApply}>
            <Gauge className="h-3.5 w-3.5" /> Apply thr
          </Button>
        )}
        {!active && (
          <Button size="sm" disabled={disabled} onClick={onUse}>
            Use
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="tnum">
      <span className="text-[11px] text-text-muted">{label} </span>
      <span className={strong ? "font-semibold text-text-primary" : "text-text-secondary"}>
        {value}
      </span>
    </span>
  );
}

function RunBanner({ run }: { run: BenchmarkRunStatus }) {
  const running = run.status === "running";
  const failed = run.status === "error";
  const tone = running ? "primary" : failed ? "danger" : "success";
  const Icon = running ? Loader2 : failed ? XCircle : CheckCircle2;
  return (
    <div
      className={`rounded-card border p-4 ${
        tone === "primary"
          ? "border-primary/25 bg-primary/10"
          : tone === "danger"
            ? "border-danger/25 bg-danger/10"
            : "border-success/25 bg-success/10"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={`h-4 w-4 ${running ? "animate-spin text-primary" : failed ? "text-danger" : "text-success"}`} />
        {running
          ? `Evaluating ${run.models.join(", ")} (${run.align}, ${run.device})…`
          : failed
            ? `Evaluation failed: ${run.error ?? "unknown error"}`
            : `Evaluation complete — ${run.models.join(", ")} scored & stored.`}
        <span className="ml-auto flex items-center gap-1 text-xs text-text-muted">
          <Cpu className="h-3 w-3" /> isolated subprocess · live model untouched
        </span>
      </div>
      {run.log.length > 0 && (
        <pre className="mt-2 max-h-28 overflow-y-auto rounded bg-black/30 p-2 text-[11px] leading-relaxed text-text-muted">
          {run.log.slice(-8).join("\n")}
        </pre>
      )}
    </div>
  );
}
