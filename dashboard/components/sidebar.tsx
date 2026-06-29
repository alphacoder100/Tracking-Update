"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  LayoutGrid,
  Clapperboard,
  ScanFace,
  Settings,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { fetcher } from "@/lib/api";
import type { HealthResponse, ModelStatus, ReviewFlag } from "@/lib/types";
import { useSidebar } from "@/components/sidebar-context";

const NAV = [
  { href: "/", label: "Live Monitor", icon: LayoutDashboard },
  { href: "/studio", label: "Video Studio", icon: Clapperboard },
  { href: "/visitors", label: "Visitors", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ai", label: "AI Diagnostics", icon: BrainCircuit },
  { href: "/benchmarks", label: "Benchmarks", icon: FlaskConical },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck, badgeKey: "review" },
  { href: "/multicam", label: "Multicam", icon: LayoutGrid },
  { href: "/camera", label: "Camera", icon: Camera },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Dot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {ok && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          ok ? "bg-success" : "bg-danger"
        }`}
      />
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  const { data: health } = useSWR<HealthResponse>("health", fetcher, {
    refreshInterval: 10000,
  });
  const { data: modelStatus } = useSWR<ModelStatus>("admin/models", fetcher, {
    refreshInterval: 30000,
  });
  const { data: flags } = useSWR<ReviewFlag[]>("admin/review-queue?limit=99", fetcher, {
    refreshInterval: 20000,
  });
  const reviewCount = flags?.length ?? 0;

  /** Close mobile overlay when a nav link is clicked */
  const handleNavClick = () => {
    if (mobileOpen) setMobileOpen(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Sidebar panel (shared between desktop & mobile)                    */
  /* ------------------------------------------------------------------ */
  const sidebarContent = (
    <aside
      className={`flex h-screen flex-col border-r border-white/5 bg-surface/40 backdrop-blur-xl transition-all duration-300 ${
        mobileOpen
          ? "w-full"
          : collapsed
            ? "w-16"
            : "w-64"
      }`}
    >
      {/* ---- Logo + collapse toggle ---- */}
      <div className="flex items-center justify-between px-3 py-5">
        <div className={`flex items-center gap-2.5 ${collapsed && !mobileOpen ? "justify-center w-full" : "px-2"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-gradient-primary shadow-glow">
            <UtensilsCrossed className="h-5 w-5 text-white" />
          </div>
          {/* Show text only when expanded (or mobile overlay) */}
          {(!collapsed || mobileOpen) && (
            <div className="leading-tight overflow-hidden whitespace-nowrap">
              <p className="text-sm font-semibold">Restaurant Tracker</p>
              <p className="text-[11px] text-text-muted">Visitor Intelligence</p>
            </div>
          )}
        </div>

        {/* Collapse / Close button */}
        {mobileOpen ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-control p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden md:flex rounded-control p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors ${
              collapsed ? "mx-auto" : ""
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* ---- Navigation ---- */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map(({ href, label, icon: Icon, badgeKey }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isCollapsed = collapsed && !mobileOpen;

          return (
            <Link
              key={href}
              href={href}
              onClick={handleNavClick}
              title={isCollapsed ? label : undefined}
              className={`group relative flex items-center rounded-control text-sm transition-all ${
                isCollapsed
                  ? "justify-center px-2 py-2"
                  : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-gradient-primary-soft font-medium text-text-primary ring-1 ring-inset ring-primary/20"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-primary" />
              )}
              <span className="relative">
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    active ? "text-primary-bright" : "text-text-muted group-hover:text-text-secondary"
                  }`}
                />
                {/* Collapsed badge: small dot indicator on the icon */}
                {isCollapsed && badgeKey === "review" && reviewCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-warning" />
                )}
              </span>

              {/* Expanded label + badge */}
              {!isCollapsed && (
                <>
                  <span className="flex-1 overflow-hidden whitespace-nowrap">{label}</span>
                  {badgeKey === "review" && reviewCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold text-warning">
                      {reviewCount}
                    </span>
                  )}
                </>
              )}

              {/* Tooltip for collapsed state */}
              {isCollapsed && (
                <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md bg-surface px-2.5 py-1.5 text-xs font-medium text-text-primary opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100">
                  {label}
                  {badgeKey === "review" && reviewCount > 0 && (
                    <span className="ml-1.5 text-warning">({reviewCount})</span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ---- System Status ---- */}
      {collapsed && !mobileOpen ? (
        /* Collapsed: show only the three status dots stacked */
        <div className="flex flex-col items-center gap-2 border-t border-white/5 py-4">
          <Dot ok={!!health?.camera_running} />
          <Dot ok={!!health?.models_loaded} />
          <Dot ok={health?.database === "connected"} />
          {modelStatus && (
            <span title={`Recognition: ${modelStatus.insightface_model}`}>
              <ScanFace className="h-3.5 w-3.5 text-text-muted" />
            </span>
          )}
        </div>
      ) : (
        <div className="p-3">
          <div className="glass-strong space-y-2.5 rounded-card px-4 py-3.5 text-xs text-text-secondary">
            <p className="eyebrow">System Status</p>
            <div className="flex items-center gap-2">
              <Dot ok={!!health?.camera_running} />
              <span className="text-text-muted">Camera</span>
              <span className="ml-auto font-medium text-text-secondary">
                {health?.camera_running ? "Running" : "Stopped"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Dot ok={!!health?.models_loaded} />
              <span className="text-text-muted">Models</span>
              <span className="ml-auto font-medium text-text-secondary">
                {health?.models_loaded ? "Loaded" : "Loading"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Dot ok={health?.database === "connected"} />
              <span className="text-text-muted">Database</span>
              <span className="ml-auto font-medium text-text-secondary">
                {health?.database ?? "—"}
              </span>
            </div>
            {modelStatus && (
              <div className="flex items-center gap-2">
                <ScanFace className="h-3 w-3 shrink-0 text-text-muted" />
                <span className="text-text-muted">Recognition</span>
                <span
                  className="ml-auto max-w-[7rem] truncate text-right font-medium text-text-secondary"
                  title={modelStatus.insightface_model}
                >
                  {modelStatus.insightface_model}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {/* ---- Desktop sidebar (sticky, hidden on mobile) ---- */}
      <div className="hidden md:block sticky top-0 h-screen">
        {sidebarContent}
      </div>

      {/* ---- Mobile overlay ---- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <div className="relative z-10 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
