import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "primary" | "success" | "warning" | "accent" | "danger";
}) {
  const toneText: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    accent: "text-accent",
    danger: "text-danger",
  };
  return (
    <div className="rounded-card border border-card/60 bg-surface p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
          {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
        </div>
        {icon && <div className={`${toneText[tone]} opacity-80`}>{icon}</div>}
      </div>
    </div>
  );
}
