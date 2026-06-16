import Link from "next/link";
import { Flame, User } from "lucide-react";

import type { VisitorSummary } from "@/lib/types";
import { imageUrl } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { Badge } from "@/components/ui";

export function VisitorAvatar({
  visitor,
  size = 40,
}: {
  visitor: Pick<VisitorSummary, "thumbnail_url" | "name">;
  size?: number;
}) {
  if (visitor.thumbnail_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl(visitor.thumbnail_url)}
        alt={visitor.name || "visitor"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-card/60 text-text-secondary"
      style={{ width: size, height: size }}
    >
      <User className="h-1/2 w-1/2" />
    </div>
  );
}

export function VisitorTable({ visitors }: { visitors: VisitorSummary[] }) {
  if (visitors.length === 0) {
    return <p className="py-8 text-center text-sm text-text-secondary">No visitors found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-card/50 text-left text-xs uppercase tracking-wide text-text-secondary">
            <th className="py-3 pl-2 pr-3 font-medium">Visitor</th>
            <th className="px-3 py-3 font-medium">Visits</th>
            <th className="px-3 py-3 font-medium">First Seen</th>
            <th className="px-3 py-3 font-medium">Last Seen</th>
            <th className="px-3 py-3 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {visitors.map((v) => (
            <tr
              key={v.id}
              className="border-b border-card/30 transition hover:bg-card/20"
            >
              <td className="py-2.5 pl-2 pr-3">
                <Link href={`/visitors/${v.id}`} className="flex items-center gap-3">
                  <VisitorAvatar visitor={v} />
                  <span className="font-medium text-text-primary">
                    {v.name || `Visitor ${v.id.slice(0, 8)}`}
                  </span>
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1 font-medium">
                  {v.visit_count}
                  {v.visit_count >= 10 && <Flame className="h-3.5 w-3.5 text-warning" />}
                </span>
              </td>
              <td className="px-3 py-2.5 text-text-secondary">{relativeTime(v.first_seen_at)}</td>
              <td className="px-3 py-2.5 text-text-secondary">{relativeTime(v.last_seen_at)}</td>
              <td className="px-3 py-2.5">
                {v.is_staff && <Badge tone="accent">Staff</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
