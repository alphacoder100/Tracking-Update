"use client";

import useSWR from "swr";
import { Info } from "lucide-react";

import { fetcher } from "@/lib/api";
import type { SettingsResponse } from "@/lib/types";
import { Card, CardTitle, ErrorState, Spinner } from "@/components/ui";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-card/30 py-2 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium">{String(value)}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { data: s, error } = useSWR<SettingsResponse>("settings", fetcher);

  if (error) return <ErrorState message="Could not load settings." />;
  if (!s) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="flex items-start gap-2 rounded-card border border-primary/30 bg-primary/10 p-4 text-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Settings are configured via the backend <code className="text-primary">.env</code> and
          loaded at startup (read-only here). Edit <code className="text-primary">.env</code> and
          restart the backend to change them. Thresholds should be{" "}
          <strong>calibrated on your own camera footage</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Recognition Thresholds</CardTitle>
          <Field label="Returning face threshold" value={s.returning_face_threshold} />
          <Field label="New-visitor max similarity" value={s.new_visitor_max_similarity} />
          <Field label="Reject similarity" value={s.reject_similarity} />
          <Field label="Ambiguity margin" value={s.ambiguity_margin} />
          <Field label="Strong-match threshold" value={s.strong_match_threshold} />
          <Field label="Body fallback enabled" value={s.allow_body_fallback ? "yes" : "no"} />
          <Field label="Returning body threshold" value={s.returning_body_threshold} />
        </Card>

        <Card>
          <CardTitle>Visit Sessions</CardTitle>
          <Field label="Cooldown (minutes)" value={s.visit_cooldown_minutes} />
          <Field label="Max duration (hours)" value={s.max_visit_duration_hours} />
          <Field label="Stale check interval (s)" value={s.stale_check_interval_seconds} />
        </Card>

        <Card>
          <CardTitle>Gallery</CardTitle>
          <Field label="Max faces per visitor" value={s.max_faces_per_visitor} />
          <Field label="Face quality cutoff" value={s.face_quality_cutoff} />
        </Card>

        <Card>
          <CardTitle>Camera & Privacy</CardTitle>
          <Field label="Camera source" value={s.camera_source} />
          <Field label="Camera FPS" value={s.camera_fps} />
          <Field label="Frame dedup enabled" value={s.frame_dedup_enabled ? "yes" : "no"} />
          <Field
            label="Visitor retention (days)"
            value={s.visitor_retention_days === 0 ? "keep forever" : s.visitor_retention_days}
          />
        </Card>
      </div>
    </div>
  );
}
