"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import Link from "next/link";
import type { EmbeddingCentroid, EmbeddingFacePoint } from "@/lib/types";

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : "http://localhost:8000";

const AXIS = "#94A3B8";
const GRID = "#334155";

const tooltipStyle = {
  backgroundColor: "#1E293B",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#F8FAFC",
  fontSize: 12,
};

export function DailyVisitsArea({ data }: { data: { day: string; visits: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" stroke={AXIS} fontSize={11} tickLine={false} />
        <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="visits"
          stroke="#3B82F6"
          strokeWidth={2}
          fill="url(#visitsFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["#3B82F6", "#8B5CF6"];

export function NewVsReturningDonut({
  newCount,
  returningCount,
}: {
  newCount: number;
  returningCount: number;
}) {
  const data = [
    { name: "New", value: newCount },
    { name: "Returning", value: returningCount },
  ];
  const total = newCount + returningCount;
  if (total === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-text-secondary">
        No data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HourlyStackedBar({
  data,
}: {
  data: { hour: number; new: number; returning: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="hour"
          stroke={AXIS}
          fontSize={11}
          tickLine={false}
          tickFormatter={(h) => `${h}h`}
        />
        <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
        <Bar dataKey="returning" stackId="a" fill="#8B5CF6" radius={[0, 0, 0, 0]} />
        <Bar dataKey="new" stackId="a" fill="#3B82F6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyBar({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
        <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: GRID, opacity: 0.3 }} />
        <Bar dataKey="value" fill="#3B82F6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DetectionQualityBar({
  high,
  medium,
  low,
}: {
  high: number;
  medium: number;
  low: number;
}) {
  const total = high + medium + low;
  if (total === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-sm text-text-secondary">
        No detections in range
      </div>
    );
  }
  const seg = [
    { label: "High", value: high, color: "#10B981" },
    { label: "Medium", value: medium, color: "#F59E0B" },
    { label: "Low", value: low, color: "#EF4444" },
  ];
  return (
    <div className="space-y-4 py-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-card/40">
        {seg.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            className="h-full transition-all"
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {seg.map((s) => (
          <div key={s.label} className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </div>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {Math.round((s.value / total) * 100)}%
            </p>
            <p className="text-[11px] text-text-muted">{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMBED_PALETTE = [
  "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4",
  "#EC4899", "#A3E635", "#F97316", "#14B8A6", "#6366F1", "#D946EF",
];

/**
 * 2D PCA projection of the face-embedding vector DB. Small dots are individual
 * gallery faces; larger ringed markers are per-visitor centroids — all colored
 * per visitor. Tight same-color clusters are good; a visitor's faces scattered
 * far apart hints at a contaminated gallery, and two different-colored centroids
 * sitting on top of each other are likely the same person split in two.
 */
type SelectedPoint =
  | { kind: "face"; pt: EmbeddingFacePoint }
  | { kind: "centroid"; pt: EmbeddingCentroid };

export function EmbeddingScatter({
  centroids,
  faces,
}: {
  centroids: EmbeddingCentroid[];
  faces: EmbeddingFacePoint[];
}) {
  const [selected, setSelected] = useState<SelectedPoint | null>(null);

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    centroids.forEach((c, i) => m.set(c.visitor_id, EMBED_PALETTE[i % EMBED_PALETTE.length]));
    return (id: string) => m.get(id) ?? "#64748B";
  }, [centroids]);

  const nameFor = useMemo(() => {
    const m = new Map<string, string>();
    centroids.forEach((c) =>
      m.set(c.visitor_id, c.name || `Visitor ${c.visitor_id.slice(0, 8)}`),
    );
    return (id: string) => m.get(id) ?? `Visitor ${id.slice(0, 8)}`;
  }, [centroids]);

  if (centroids.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-text-secondary">
        No visitor embeddings yet.
      </div>
    );
  }

  const FaceShape = (p: { cx?: number; cy?: number; payload?: EmbeddingFacePoint }) => {
    if (p.cx == null || p.cy == null || !p.payload) return <g />;
    const isSelected =
      selected?.kind === "face" && selected.pt.face_id === p.payload.face_id;
    return (
      <circle
        cx={p.cx}
        cy={p.cy}
        r={isSelected ? 5 : 3}
        fill={colorFor(p.payload.visitor_id)}
        fillOpacity={isSelected ? 1 : 0.45}
        stroke={isSelected ? "#fff" : "none"}
        strokeWidth={isSelected ? 1.5 : 0}
        style={{ cursor: p.payload.face_id ? "pointer" : "default" }}
      />
    );
  };

  const CentroidShape = (p: { cx?: number; cy?: number; payload?: EmbeddingCentroid }) => {
    if (p.cx == null || p.cy == null || !p.payload) return <g />;
    const isSelected =
      selected?.kind === "centroid" && selected.pt.visitor_id === p.payload.visitor_id;
    return (
      <circle
        cx={p.cx}
        cy={p.cy}
        r={isSelected ? 9 : 7}
        fill={colorFor(p.payload.visitor_id)}
        stroke={isSelected ? "#fff" : "#0B1220"}
        strokeWidth={2}
        style={{ cursor: "pointer" }}
      />
    );
  };

  const TipContent = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: { payload?: EmbeddingFacePoint | EmbeddingCentroid }[];
  }) => {
    const pt = active && payload?.length ? payload[0]?.payload : undefined;
    if (!pt) return null;
    const isCentroid = "gallery_size" in pt;
    return (
      <div style={tooltipStyle} className="px-2.5 py-1.5">
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
          style={{ backgroundColor: colorFor(pt.visitor_id) }}
        />
        {nameFor(pt.visitor_id)}
        {isCentroid
          ? <span style={{ color: AXIS }}> · centroid</span>
          : <span style={{ color: AXIS }}> · click to view photo</span>
        }
      </div>
    );
  };

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart
          margin={{ top: 10, right: 16, bottom: 8, left: 0 }}
        >
          <XAxis
            type="number"
            dataKey="x"
            name="PC1"
            tick={false}
            axisLine={{ stroke: GRID }}
            label={{ value: "PC1", position: "insideBottom", fill: AXIS, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="PC2"
            tick={false}
            axisLine={{ stroke: GRID }}
            label={{ value: "PC2", angle: -90, position: "insideLeft", fill: AXIS, fontSize: 11 }}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: GRID }}
            content={<TipContent />}
          />
          <Scatter
            data={faces}
            shape={FaceShape}
            isAnimationActive={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(data: any) => {
              if (data?.visitor_id) setSelected({ kind: "face", pt: data as EmbeddingFacePoint });
            }}
          />
          <Scatter
            data={centroids}
            shape={CentroidShape}
            isAnimationActive={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(data: any) => {
              if (data?.visitor_id) setSelected({ kind: "centroid", pt: data as EmbeddingCentroid });
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* ── Photo popup ── */}
      {selected && (
        <FacePopup
          selected={selected}
          nameFor={nameFor}
          colorFor={colorFor}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function FacePopup({
  selected,
  nameFor,
  colorFor,
  onClose,
}: {
  selected: SelectedPoint;
  nameFor: (id: string) => string;
  colorFor: (id: string) => string;
  onClose: () => void;
}) {
  const vid = selected.pt.visitor_id;
  const name = nameFor(vid);
  const color = colorFor(vid);

  const cropUrl =
    selected.kind === "face" && selected.pt.face_id
      ? `${API_BASE}/api/visitors/${vid}/faces/${selected.pt.face_id}/crop`
      : null;

  return (
    <div
      className="absolute left-10 top-4 z-20 w-48 rounded-card border border-white/10 bg-surface/95 p-3 shadow-xl backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="truncate text-xs font-medium text-text-primary" title={name}>
            {name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>

      {/* Photo */}
      {cropUrl ? (
        <img
          src={cropUrl}
          alt={name}
          className="h-36 w-full rounded-control object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "";
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-36 items-center justify-center rounded-control bg-white/5 text-xs text-text-muted">
          {selected.kind === "centroid" ? "Centroid — no single photo" : "No crop available"}
        </div>
      )}

      {/* Link to visitor profile */}
      <Link
        href={`/visitors/${vid}`}
        className="mt-2 flex w-full items-center justify-center rounded-control bg-white/5 px-2 py-1 text-[11px] text-text-secondary hover:bg-white/10 hover:text-text-primary"
      >
        Open visitor profile →
      </Link>
    </div>
  );
}

export function FrequencyBar({ data }: { data: { bucket: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
      >
        <XAxis type="number" stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="bucket"
          stroke={AXIS}
          fontSize={11}
          tickLine={false}
          width={70}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: GRID, opacity: 0.3 }} />
        <Bar dataKey="count" fill="#10B981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
