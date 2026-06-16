"use client";

import { useState } from "react";
import useSWR from "swr";
import { Flame } from "lucide-react";

import { fetcher } from "@/lib/api";
import type {
  AnalyticsSummary,
  FrequencyDistribution,
  HourlyBreakdown,
  TopVisitor,
} from "@/lib/types";
import {
  DailyVisitsArea,
  FrequencyBar,
  HourlyStackedBar,
  NewVsReturningDonut,
} from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Button, Card, CardTitle } from "@/components/ui";
import { formatDuration } from "@/lib/format";

type RangeKey = "today" | "week" | "month";

function sinceFor(key: RangeKey): string {
  const d = new Date();
  if (key === "today") d.setHours(0, 0, 0, 0);
  else if (key === "week") d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString();
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("month");
  const since = sinceFor(range);

  const { data: summary } = useSWR<AnalyticsSummary>(`analytics/summary?since=${since}`, fetcher);
  const { data: freq } = useSWR<FrequencyDistribution>("analytics/frequency", fetcher);
  const { data: hourly } = useSWR<HourlyBreakdown>(`analytics/hourly?since=${since}`, fetcher);
  const { data: top } = useSWR<TopVisitor[]>("analytics/top-visitors?limit=5", fetcher);

  const freqData = freq
    ? Object.entries(freq.distribution).map(([bucket, count]) => ({
        bucket: bucket === "1" ? "1 visit" : `${bucket} visits`,
        count,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="flex gap-2">
          {(["today", "week", "month"] as RangeKey[]).map((k) => (
            <Button key={k} variant={range === k ? "primary" : "ghost"} onClick={() => setRange(k)}>
              {k === "today" ? "Today" : k === "week" ? "This Week" : "This Month"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Unique Visitors" value={summary?.total_unique_visitors ?? "—"} />
        <StatCard label="Total Visits" value={summary?.total_visits ?? "—"} tone="success" />
        <StatCard
          label="Return Rate"
          value={summary ? `${Math.round(summary.return_rate * 100)}%` : "—"}
          tone="accent"
        />
        <StatCard
          label="Avg Duration"
          value={summary ? formatDuration(Math.round(summary.average_duration_minutes)) : "—"}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Daily Visits</CardTitle>
          <DailyVisitsArea data={summary?.visits_by_day ?? []} />
        </Card>
        <Card>
          <CardTitle>New vs Returning</CardTitle>
          <NewVsReturningDonut
            newCount={summary?.new_visitors ?? 0}
            returningCount={summary?.returning_visitors ?? 0}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Hourly (New + Returning)</CardTitle>
          <HourlyStackedBar data={hourly?.hourly ?? []} />
        </Card>
        <Card>
          <CardTitle>Top Regulars</CardTitle>
          <ol className="space-y-2 text-sm">
            {(top ?? []).map((v, i) => (
              <li key={v.visitor_id} className="flex items-center justify-between">
                <a href={`/visitors/${v.visitor_id}`} className="flex items-center gap-2 hover:text-primary">
                  <span className="text-text-secondary">{i + 1}.</span>
                  {v.name || `Visitor ${v.visitor_id.slice(0, 8)}`}
                </a>
                <span className="inline-flex items-center gap-1 font-medium">
                  {v.visit_count}
                  {v.visit_count >= 10 && <Flame className="h-3.5 w-3.5 text-warning" />}
                </span>
              </li>
            ))}
            {(top ?? []).length === 0 && (
              <li className="py-4 text-center text-text-secondary">No data yet.</li>
            )}
          </ol>
        </Card>
      </div>

      <Card>
        <CardTitle>Visit Frequency Distribution</CardTitle>
        <FrequencyBar data={freqData} />
      </Card>
    </div>
  );
}
