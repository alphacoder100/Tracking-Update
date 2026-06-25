"use client";

import useSWR from "swr";
import { DoorOpen, Users } from "lucide-react";

import { fetcher } from "@/lib/api";
import type { ActivityResponse, GateStats } from "@/lib/types";
import { DetectionFeed } from "@/components/detection-feed";
import { ActivityFeed } from "@/components/activity-feed";
import { StatCard } from "@/components/stat-card";
import { Card, CardTitle, PageHeader } from "@/components/ui";

export default function LiveMonitorPage() {
  const { data: activity } = useSWR<ActivityResponse>("activity?limit=12", fetcher, {
    refreshInterval: 5000,
  });
  const { data: gate } = useSWR<GateStats>("analytics/gate", fetcher, {
    refreshInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Monitor"
        subtitle="Real-time feed with on-frame recognition labels."
      />

      {gate?.enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Completed Visits (Entry→Exit)"
            value={gate.completed_total}
            hint={`${gate.completed_today} today`}
            icon={<DoorOpen className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Currently Inside"
            value={gate.currently_inside}
            hint={`${gate.entry_camera_id ?? "?"} → ${gate.exit_camera_id ?? "?"}`}
            icon={<Users className="h-5 w-5" />}
            tone="primary"
          />
        </div>
      )}

      <DetectionFeed />

      <Card>
        <CardTitle>Recent Activity</CardTitle>
        <ActivityFeed events={activity?.events ?? []} />
      </Card>
    </div>
  );
}
