import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-card/60 bg-surface p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </h2>
  );
}

type BadgeTone = "primary" | "success" | "warning" | "danger" | "accent" | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  accent: "bg-accent/15 text-accent",
  neutral: "bg-card/60 text-text-secondary",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "danger" | "ghost" | "success";

const buttonClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary hover:bg-primary/90 text-white",
  success: "bg-success hover:bg-success/90 text-white",
  danger: "bg-danger hover:bg-danger/90 text-white",
  ghost: "bg-card/40 hover:bg-card/70 text-text-primary",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-secondary">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-card border-t-primary" />
      {label || "Loading…"}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-dashed border-card/60 p-8 text-center text-sm text-text-secondary">
      {message}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
      {message}
    </div>
  );
}
