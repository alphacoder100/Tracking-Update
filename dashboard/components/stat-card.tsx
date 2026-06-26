import { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

type Tone = "primary" | "success" | "warning" | "accent" | "danger";

const toneTile: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary-bright ring-1 ring-inset ring-primary/20",
  success: "bg-success/15 text-success-bright ring-1 ring-inset ring-success/20",
  warning: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/20",
  accent: "bg-accent/15 text-accent-bright ring-1 ring-inset ring-accent/20",
  danger: "bg-danger/15 text-danger-bright ring-1 ring-inset ring-danger/20",
};

const toneBar: Record<Tone, string> = {
  primary: "from-primary/60",
  success: "from-success/60",
  warning: "from-warning/60",
  accent: "from-accent/60",
  danger: "from-danger/60",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** Optional period-over-period delta in %. Positive = up (green), negative = down. */
  trend?: number | null;
}) {
  const showTrend = typeof trend === "number" && Number.isFinite(trend);
  const up = (trend ?? 0) >= 0;
  return (
    <div className="glass glass-hover group relative animate-fade-in-up overflow-hidden rounded-card p-5 shadow-card">
      {/* Accent edge that warms up on hover. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent opacity-60 ${toneBar[tone]}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-text-secondary">
            {label}
          </p>
          <p className="tnum mt-2 text-3xl font-semibold tracking-tight text-text-primary">
            {value}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            {showTrend && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                  up ? "text-success-bright" : "text-danger-bright"
                }`}
              >
                {up ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {Math.abs(trend!).toFixed(0)}%
              </span>
            )}
            {hint && <p className="truncate text-xs text-text-muted">{hint}</p>}
          </div>
        </div>
        {icon && (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition-transform duration-200 group-hover:scale-105 ${toneTile[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
