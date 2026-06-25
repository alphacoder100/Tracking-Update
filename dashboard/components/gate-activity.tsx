import Link from "next/link";
import { DoorOpen, LogIn, LogOut } from "lucide-react";

import { imageUrl } from "@/lib/api";
import type { GatePass } from "@/lib/types";
import { formatTime, relativeTime, shortId } from "@/lib/format";
import { Badge } from "@/components/ui";

function displayName(p: GatePass): string {
  return p.visitor_name || (p.visitor_id ? `Visitor ${shortId(p.visitor_id)}` : "Unknown");
}

function durationText(sec: number | null): string {
  if (sec == null) return "";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function Avatar({ p }: { p: GatePass }) {
  if (p.thumbnail_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl(p.thumbnail_url)}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card/60 text-text-muted">
      <DoorOpen className="h-4 w-4" />
    </div>
  );
}

function PassRow({ p, kind }: { p: GatePass; kind: "inside" | "done" }) {
  const inner = (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar p={p} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary">{displayName(p)}</span>
          {kind === "inside" ? (
            <Badge tone="warning">
              <LogIn className="h-3 w-3" /> Inside
            </Badge>
          ) : (
            <Badge tone="success">
              <LogOut className="h-3 w-3" /> Exited
            </Badge>
          )}
        </div>
        <p className="text-xs text-text-secondary">
          Entered {formatTime(p.entered_at)}
          {kind === "done" && p.exited_at
            ? ` · Exited ${formatTime(p.exited_at)} · ${durationText(p.duration_seconds)} inside`
            : ""}
        </p>
      </div>
      <p className="shrink-0 text-xs text-text-muted">
        {relativeTime(kind === "done" ? p.exited_at : p.entered_at)}
      </p>
    </div>
  );
  return p.visitor_id ? (
    <Link href={`/visitors/${p.visitor_id}`} className="block rounded-control hover:bg-card/20">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Column({
  title,
  passes,
  kind,
  emptyText,
}: {
  title: string;
  passes: GatePass[];
  kind: "inside" | "done";
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h3>
      {passes.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-card/40">
          {passes.map((p) => (
            <li key={p.id}>
              <PassRow p={p} kind={kind} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Live entry/exit roster for the two-camera gate: who is currently inside
 * (entered, not yet exited) and the most recent completed entry→exit visits.
 */
export function GateActivity({ inside, recent }: { inside: GatePass[]; recent: GatePass[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Column
        title={`Inside now (${inside.length})`}
        passes={inside}
        kind="inside"
        emptyText="Nobody inside right now."
      />
      <Column
        title="Recent visits (entry → exit)"
        passes={recent}
        kind="done"
        emptyText="No completed visits yet."
      />
    </div>
  );
}
