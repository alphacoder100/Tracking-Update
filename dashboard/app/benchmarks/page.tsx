"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Cpu,
  FileVideo,
  FlaskConical,
  Gauge,
  Layers,
  Loader2,
  MemoryStick,
  Play,
  ScanFace,
  Server,
  Trophy,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type {
  BenchmarkSummary,
  VideoBenchmarkOptions,
  VideoBenchmarkReport,
  VideoBenchmarkRunStatus,
  VideoDetectionRow,
  VideoPipelineRow,
  VideoRecognitionRow,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui";

const OPTIONS_KEY = "admin/benchmarks/video/options";
const RUN_KEY = "admin/benchmarks/video/run";
const LIST_KEY = "admin/benchmarks";

const num = (d: number) => (v: unknown) =>
  typeof v === "number" ? v.toFixed(d) : "—";
const pct = (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");
const orNA = (v: unknown, d = 0) =>
  v === null || v === undefined ? "N/A" : typeof v === "number" ? v.toFixed(d) : String(v);
// Real-time factor: throughput ÷ the source video's fps. ≥1× keeps up in real time.
const rtFmt = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)}×` : "—");
const str = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

type Dir = "min" | "max";
type Col<T> = {
  key: keyof T;
  label: string;
  fmt: (v: unknown) => string;
  best?: Dir; // if set, best value across rows is highlighted
  hint?: string;
};

// ── Column definitions ───────────────────────────────────────

const DETECTION_COLS: Col<VideoDetectionRow>[] = [
  { key: "det_per_frame", label: "Det/frame", fmt: num(2) },
  { key: "mean_conf", label: "Conf", fmt: num(3), best: "max" },
  { key: "fps", label: "FPS", fmt: num(1), best: "max" },
  { key: "rt_factor", label: "Real-time", fmt: rtFmt, best: "max", hint: "throughput ÷ video fps · ≥1× keeps up in real time" },
  { key: "ms_mean", label: "ms mean", fmt: num(1), best: "min" },
  { key: "ms_p95", label: "ms p95", fmt: num(1), best: "min", hint: "95th-percentile per-frame latency (tail, not average)" },
  { key: "ms_p99", label: "ms p99", fmt: num(1), best: "min", hint: "99th-percentile per-frame latency (worst-case stalls)" },
  { key: "ms_max", label: "ms max", fmt: num(1), best: "min", hint: "slowest single frame" },
  { key: "load_ms", label: "Load ms", fmt: num(0), best: "min", hint: "cold-start: model load + first warmup inference" },
  { key: "cpu_pct_mean", label: "CPU%", fmt: num(0) },
  { key: "cpu_pct_peak", label: "CPU% pk", fmt: num(0), hint: "peak CPU during the run" },
  { key: "ram_mb_mean", label: "RAM MB", fmt: num(0) },
  { key: "ram_mb_peak", label: "RAM pk", fmt: num(0), hint: "peak RAM during the run" },
  { key: "gpu_pct_mean", label: "GPU%", fmt: (v) => orNA(v, 0) },
  { key: "gpu_pct_peak", label: "GPU% pk", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_mean", label: "VRAM MB", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_peak", label: "VRAM pk", fmt: (v) => orNA(v, 0) },
];

const RECOGNITION_COLS: Col<VideoRecognitionRow>[] = [
  { key: "margin", label: "Margin", fmt: num(3), best: "max", hint: "intra − inter similarity (higher = better discrimination)" },
  { key: "intra_sim", label: "Intra sim", fmt: num(3), best: "max", hint: "same-person similarity (higher better)" },
  { key: "inter_sim", label: "Inter sim", fmt: num(3), best: "min", hint: "different-person similarity (lower better)" },
  { key: "dup_rate", label: "Dup rate", fmt: pct, best: "min", hint: "different people falsely too-similar (lower better)" },
  { key: "tracks", label: "Tracks", fmt: num(0) },
  { key: "fps", label: "FPS", fmt: num(1), best: "max" },
  { key: "rt_factor", label: "Real-time", fmt: rtFmt, best: "max", hint: "embeddings/s ÷ the face rate the footage produces · ≥1× keeps up" },
  { key: "ms_mean", label: "ms mean", fmt: num(1), best: "min" },
  { key: "ms_p95", label: "ms p95", fmt: num(1), best: "min", hint: "95th-percentile per-face latency" },
  { key: "ms_p99", label: "ms p99", fmt: num(1), best: "min", hint: "99th-percentile per-face latency" },
  { key: "load_ms", label: "Load ms", fmt: num(0), best: "min", hint: "cold-start: model load time" },
  { key: "cpu_pct_mean", label: "CPU%", fmt: num(0) },
  { key: "cpu_pct_peak", label: "CPU% pk", fmt: num(0) },
  { key: "ram_mb_mean", label: "RAM MB", fmt: num(0) },
  { key: "ram_mb_peak", label: "RAM pk", fmt: num(0) },
  { key: "gpu_pct_mean", label: "GPU%", fmt: (v) => orNA(v, 0) },
  { key: "gpu_pct_peak", label: "GPU% pk", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_mean", label: "VRAM MB", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_peak", label: "VRAM pk", fmt: (v) => orNA(v, 0) },
];

// Full end-to-end (person-detect + face-detect + recognize) pairing table.
const PIPELINE_COLS: Col<VideoPipelineRow>[] = [
  { key: "recognition", label: "Recognition", fmt: str },
  { key: "fps", label: "FPS", fmt: num(1), best: "max", hint: "end-to-end frames/second for the whole pairing" },
  { key: "rt_factor", label: "Real-time", fmt: rtFmt, best: "max", hint: "end-to-end throughput ÷ video fps · ≥1× keeps up" },
  { key: "ms_mean", label: "ms/frame", fmt: num(1), best: "min" },
  { key: "ms_p95", label: "ms p95", fmt: num(1), best: "min" },
  { key: "ms_p99", label: "ms p99", fmt: num(1), best: "min" },
  { key: "persons", label: "Persons", fmt: num(0) },
  { key: "faces", label: "Faces", fmt: num(0) },
  { key: "cpu_pct_mean", label: "CPU%", fmt: num(0) },
  { key: "cpu_pct_peak", label: "CPU% pk", fmt: num(0) },
  { key: "ram_mb_mean", label: "RAM MB", fmt: num(0) },
  { key: "ram_mb_peak", label: "RAM pk", fmt: num(0) },
  { key: "gpu_pct_mean", label: "GPU%", fmt: (v) => orNA(v, 0) },
  { key: "gpu_pct_peak", label: "GPU% pk", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_mean", label: "VRAM MB", fmt: (v) => orNA(v, 0) },
  { key: "vram_mb_peak", label: "VRAM pk", fmt: (v) => orNA(v, 0) },
];

export default function BenchmarkPage() {
  const { mutate } = useSWRConfig();
  const { data: options } = useSWR<VideoBenchmarkOptions>(OPTIONS_KEY, fetcher);
  const { data: run } = useSWR<VideoBenchmarkRunStatus>(RUN_KEY, fetcher, {
    refreshInterval: (latest) => (latest?.status === "running" ? 1500 : 0),
  });
  const { data: list } = useSWR<BenchmarkSummary[]>(LIST_KEY, fetcher);

  // Config state
  const [file, setFile] = useState<File | null>(null);
  const [detModels, setDetModels] = useState<string[]>([]);
  const [recModels, setRecModels] = useState<string[]>([]);
  const [devices, setDevices] = useState<string[]>(["cpu"]);
  const [maxFrames, setMaxFrames] = useState(120);
  const [pipeline, setPipeline] = useState(true);
  const [uploading, setUploading] = useState(false);

  const running = run?.status === "running";

  // Default model selections once options load.
  useEffect(() => {
    if (!options) return;
    setDetModels((prev) =>
      prev.length ? prev : options.detection_models.slice(0, 3),
    );
    setRecModels((prev) =>
      prev.length ? prev : options.recognition_models.slice(0, 3),
    );
    if (options.cuda_available) setDevices((prev) => prev);
  }, [options]);

  // Newest saved video report → load it for the tables.
  const latestVideoReport = useMemo(() => {
    const fromRun = run?.status === "done" ? run.report : null;
    if (fromRun) return fromRun;
    const videos = (list ?? []).filter((b) => b.kind === "video");
    return videos.length ? videos[0].name : null;
  }, [run, list]);

  const { data: report } = useSWR<VideoBenchmarkReport>(
    latestVideoReport ? `admin/benchmarks/${latestVideoReport}` : null,
    fetcher,
  );

  // Refresh the report list when a run finishes.
  const lastStatus = run?.status;
  useEffect(() => {
    if (lastStatus === "done") void mutate(LIST_KEY);
  }, [lastStatus, mutate]);

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function runBenchmark() {
    if (!file) {
      alert("Choose a video file first.");
      return;
    }
    if (detModels.length === 0 && recModels.length === 0) {
      alert("Select at least one detection or recognition model.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("detection_models", detModels.join(","));
      form.append("recognition_models", recModels.join(","));
      form.append("devices", devices.join(","));
      form.append("max_frames", String(maxFrames));
      form.append("run_pipeline", String(pipeline));
      await api.upload(RUN_KEY, form);
      await mutate(RUN_KEY);
    } catch (e) {
      alert(`Could not start benchmark: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Model selection"
        title="Video Benchmark"
        subtitle="Upload a clip and score every detection + recognition model on it — speed, CPU/GPU cost, and recognition quality — all measured on your own footage and laid out side by side."
        icon={<FlaskConical className="h-5 w-5" />}
      />

      {/* ── Configuration ── */}
      <Card>
        <CardTitle icon={<Upload className="h-4 w-4" />}>
          Configure run
        </CardTitle>
        {!options ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* Left: upload + devices + frames */}
            <div className="space-y-4">
              <Dropzone file={file} onFile={setFile} disabled={running} />

              <div>
                <Label>Devices</Label>
                <div className="flex gap-2">
                  <Chip
                    active={devices.includes("cpu")}
                    onClick={() => setDevices((d) => toggle(d, "cpu"))}
                    disabled={running}
                    icon={<Cpu className="h-3.5 w-3.5" />}
                  >
                    CPU
                  </Chip>
                  <Chip
                    active={devices.includes("cuda")}
                    onClick={() => setDevices((d) => toggle(d, "cuda"))}
                    disabled={running || !options.cuda_available}
                    icon={<Server className="h-3.5 w-3.5" />}
                  >
                    GPU{options.gpu_name ? ` · ${shortGpu(options.gpu_name)}` : ""}
                  </Chip>
                </div>
                {!options.cuda_available && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    No CUDA GPU detected — CPU only.
                  </p>
                )}
              </div>

              <div className="max-w-[12rem]">
                <Label>Max frames sampled</Label>
                <Input
                  type="number"
                  value={maxFrames}
                  onChange={(v) => setMaxFrames(Math.max(10, Math.min(600, Number(v) || 0)))}
                  min={10}
                  max={600}
                />
              </div>

              <div>
                <Label>End-to-end pipeline</Label>
                <Chip
                  active={pipeline}
                  onClick={() => setPipeline((p) => !p)}
                  disabled={running}
                  icon={<Layers className="h-3.5 w-3.5" />}
                >
                  Full detect → recognize combo
                </Chip>
                <p className="mt-1.5 text-[11px] text-text-muted">
                  Measures each detection × recognition pairing running together
                  (real ms/frame + combined cost). Adds a pass per pairing — turn
                  off for a faster run.
                </p>
              </div>
            </div>

            {/* Right: model selection */}
            <div className="space-y-4">
              <div>
                <Label>Detection models (YOLO)</Label>
                <div className="flex flex-wrap gap-2">
                  {options.detection_models.map((m) => (
                    <Chip
                      key={m}
                      active={detModels.includes(m)}
                      onClick={() => setDetModels((l) => toggle(l, m))}
                      disabled={running}
                    >
                      {m}
                      {m === options.active_yolo && <Dot />}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <Label>Recognition models</Label>
                <div className="flex flex-wrap gap-2">
                  {options.recognition_models.map((m) => (
                    <Chip
                      key={m}
                      active={recModels.includes(m)}
                      onClick={() => setRecModels((l) => toggle(l, m))}
                      disabled={running}
                    >
                      {m}
                      {m === options.active_recognition && <Dot />}
                    </Chip>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted">
                  <Dot /> = currently live. Recognition models embed the SAME tracked
                  faces, so the comparison is fair.
                </p>
              </div>

              <Button
                disabled={running || uploading || !file}
                onClick={runBenchmark}
                className="w-full"
              >
                {running || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? "Benchmark running…" : uploading ? "Uploading…" : "Run benchmark"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Run progress ── */}
      {run && run.status !== "idle" && <RunBanner run={run} />}

      {/* ── Results ── */}
      {report ? (
        <>
          <ReportMeta report={report} />
          <SystemPanel report={report} />
          {report.detection.length > 0 && (
            <ResultsTable<VideoDetectionRow>
              title="Detection models"
              icon={<ScanFace className="h-4 w-4" />}
              rows={report.detection}
              cols={DETECTION_COLS}
            />
          )}
          {report.recognition.length > 0 && (
            <ResultsTable<VideoRecognitionRow>
              title="Recognition models"
              icon={<Trophy className="h-4 w-4" />}
              rows={report.recognition}
              cols={RECOGNITION_COLS}
            />
          )}
          {report.pipeline && report.pipeline.length > 0 && (
            <ResultsTable<VideoPipelineRow>
              title="Full pipeline (detect → recognize)"
              icon={<Layers className="h-4 w-4" />}
              rows={report.pipeline}
              cols={PIPELINE_COLS}
            />
          )}
        </>
      ) : run?.status === "running" ? (
        <Card>
          <Skeleton className="h-40" />
        </Card>
      ) : (
        <EmptyState
          icon={<FileVideo className="h-8 w-8" />}
          message="No video benchmark yet. Upload a clip and run one to see the comparison tables."
        />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
      {children}
    </p>
  );
}

function Dot() {
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-primary-bright align-middle" />;
}

function shortGpu(name: string): string {
  return name.replace(/NVIDIA GeForce /i, "").replace(/NVIDIA /i, "");
}

function Chip({
  children,
  active,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-primary/20 text-primary-bright ring-primary/40"
          : "bg-white/5 text-text-secondary ring-white/10 hover:bg-white/10"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Dropzone({
  file,
  onFile,
  disabled,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <Label>Video clip</Label>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition ${
          dragging
            ? "border-primary bg-primary/5"
            : file
              ? "border-success/40 bg-success/5"
              : "border-white/15 hover:border-white/30"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <FileVideo className={`h-7 w-7 ${file ? "text-success" : "text-text-muted"}`} />
        {file ? (
          <div>
            <p className="text-sm font-medium text-text-primary">{file.name}</p>
            <p className="text-[11px] text-text-muted">
              {(file.size / (1024 * 1024)).toFixed(1)} MB · click to replace
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-secondary">
              Drop a video here or click to browse
            </p>
            <p className="text-[11px] text-text-muted">mp4 · mov · avi · mkv</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

function ReportMeta({ report }: { report: VideoBenchmarkReport }) {
  const m = report.meta;
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5 font-medium text-text-primary">
          <FileVideo className="h-3.5 w-3.5 text-primary-bright" />
          {m.video}
        </span>
        <Meta label="Frames" value={`${m.frames_sampled} (stride ${m.frame_stride})`} />
        <Meta label="Resolution" value={m.resolution} />
        <Meta label="Duration" value={`${m.duration_s}s`} />
        <Meta label="Devices" value={m.devices.map((d) => d.toUpperCase()).join(" + ")} />
        {m.gpu_name && <Meta label="GPU" value={shortGpu(m.gpu_name)} />}
      </div>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-secondary">{value}</span>
    </span>
  );
}

function fmtGB(mb?: number | null): string {
  return typeof mb === "number" ? `${(mb / 1024).toFixed(1)} GB` : "—";
}

// Machine capacity — the headroom the per-run CPU/GPU/RAM/VRAM costs are spent
// against. Skipped for older reports saved before system info was captured.
function SystemPanel({ report }: { report: VideoBenchmarkReport }) {
  const s = report.meta.system;
  if (!s) return null;
  const cores =
    s.cpu_cores_physical || s.cpu_cores_logical
      ? `${s.cpu_cores_physical ?? "?"}C / ${s.cpu_cores_logical ?? "?"}T`
      : "—";
  return (
    <Card padding="sm">
      <CardTitle icon={<Gauge className="h-4 w-4" />}>Machine capacity</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SysStat icon={<Cpu className="h-4 w-4" />} label="CPU" value={s.cpu_name ?? "—"} sub={cores} />
        <SysStat icon={<MemoryStick className="h-4 w-4" />} label="RAM total" value={fmtGB(s.ram_total_mb)} />
        <SysStat icon={<Server className="h-4 w-4" />} label="GPU" value={s.gpu_name ? shortGpu(s.gpu_name) : "None (CPU only)"} />
        <SysStat icon={<Zap className="h-4 w-4" />} label="VRAM total" value={fmtGB(s.vram_total_mb)} />
      </div>
    </Card>
  );
}

function SysStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-card bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
      <span className="mt-0.5 text-text-muted">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-text-primary" title={value}>{value}</p>
        {sub && <p className="text-[11px] text-text-secondary">{sub}</p>}
      </div>
    </div>
  );
}

function ResultsTable<T extends { model: string; device: string; error?: string }>({
  title,
  icon,
  rows,
  cols,
}: {
  title: string;
  icon: React.ReactNode;
  rows: T[];
  cols: Col<T>[];
}) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Best value per highlightable column (across rows without errors).
  const bestByCol = useMemo(() => {
    const out: Partial<Record<keyof T, number>> = {};
    for (const c of cols) {
      if (!c.best) continue;
      const vals: number[] = [];
      for (const r of rows) {
        if (r.error) continue;
        const v = r[c.key] as unknown;
        if (typeof v === "number") vals.push(v);
      }
      if (vals.length) out[c.key] = c.best === "min" ? Math.min(...vals) : Math.max(...vals);
    }
    return out;
  }, [rows, cols]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "number" ? av : -Infinity;
      const bn = typeof bv === "number" ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function onSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <Card padding="sm">
      <CardTitle icon={icon}>{title}</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Device</th>
              {cols.map((c) => (
                <th
                  key={String(c.key)}
                  onClick={() => onSort(c.key)}
                  title={c.hint}
                  className="cursor-pointer select-none px-3 py-2 font-medium hover:text-text-secondary"
                >
                  {c.label}
                  {sortKey === c.key && (sortDir === "asc" ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={`${r.model}-${r.device}-${i}`}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
              >
                <td className="px-3 py-2 font-medium text-text-primary">{r.model}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.device === "cuda" ? "accent" : "neutral"}>
                    {r.device === "cuda" ? (
                      <Server className="h-3 w-3" />
                    ) : (
                      <Cpu className="h-3 w-3" />
                    )}
                    {r.device.toUpperCase()}
                  </Badge>
                </td>
                {r.error ? (
                  <td colSpan={cols.length} className="px-3 py-2 text-danger">
                    {r.error}
                  </td>
                ) : (
                  cols.map((c) => {
                    const v = r[c.key];
                    const isBest =
                      c.best &&
                      typeof v === "number" &&
                      bestByCol[c.key] !== undefined &&
                      Math.abs(v - (bestByCol[c.key] as number)) < 1e-9;
                    return (
                      <td
                        key={String(c.key)}
                        className={`tnum px-3 py-2 ${
                          isBest
                            ? "font-semibold text-success-bright"
                            : "text-text-secondary"
                        }`}
                      >
                        {c.fmt(v)}
                        {isBest && <Zap className="ml-1 inline h-3 w-3 text-success" />}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-muted">
        <Gauge className="h-3 w-3" />
        Click a column to sort. <Zap className="h-3 w-3 text-success" /> marks the
        best value per metric.
      </p>
    </Card>
  );
}

function RunBanner({ run }: { run: VideoBenchmarkRunStatus }) {
  const running = run.status === "running";
  const failed = run.status === "error";
  const Icon = running ? Loader2 : failed ? XCircle : Trophy;
  return (
    <div
      className={`rounded-card border p-4 ${
        running
          ? "border-primary/25 bg-primary/10"
          : failed
            ? "border-danger/25 bg-danger/10"
            : "border-success/25 bg-success/10"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon
          className={`h-4 w-4 ${
            running ? "animate-spin text-primary" : failed ? "text-danger" : "text-success"
          }`}
        />
        {running
          ? `Benchmarking ${run.video ?? "video"} on ${run.devices
              .map((d) => d.toUpperCase())
              .join(" + ")}…`
          : failed
            ? `Benchmark failed: ${run.error ?? "unknown error"}`
            : `Benchmark complete — ${run.video ?? "video"} scored & stored.`}
        <span className="ml-auto flex items-center gap-1 text-xs text-text-muted">
          <Cpu className="h-3 w-3" /> isolated subprocess · live model untouched
        </span>
      </div>
      {run.log.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-y-auto rounded bg-black/30 p-2 text-[11px] leading-relaxed text-text-muted">
          {run.log.slice(-14).join("\n")}
        </pre>
      )}
    </div>
  );
}
