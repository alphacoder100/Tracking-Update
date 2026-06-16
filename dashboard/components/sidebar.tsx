"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  Camera,
  LayoutDashboard,
  Settings,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import { fetcher } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";

const NAV = [
  { href: "/", label: "Live Monitor", icon: LayoutDashboard },
  { href: "/visitors", label: "Visitors", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/camera", label: "Camera", icon: Camera },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-danger"}`}
    />
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: health } = useSWR<HealthResponse>("health", fetcher, {
    refreshInterval: 10000,
  });

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-card/50 bg-surface">
      <div className="flex items-center gap-2 px-5 py-5 text-lg font-semibold">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
        <span>Restaurant Tracker</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm transition ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-text-secondary hover:bg-card/40 hover:text-text-primary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-card/50 px-5 py-4 text-xs text-text-secondary">
        <p className="font-semibold uppercase tracking-wide">System Status</p>
        <div className="flex items-center gap-2">
          <Dot ok={!!health?.camera_running} />
          Camera: {health?.camera_running ? "Running" : "Stopped"}
        </div>
        <div className="flex items-center gap-2">
          <Dot ok={!!health?.models_loaded} />
          Models: {health?.models_loaded ? "Loaded" : "Loading"}
        </div>
        <div className="flex items-center gap-2">
          <Dot ok={health?.database === "connected"} />
          DB: {health?.database ?? "—"}
        </div>
      </div>
    </aside>
  );
}
