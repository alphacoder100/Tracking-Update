"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ArrowRight, DoorOpen, Save } from "lucide-react";

import { api, fetcher } from "@/lib/api";
import type { AdminSettings } from "@/lib/types";
import { Badge, Button, Card, CardTitle, Input, Select, Toggle } from "@/components/ui";

/**
 * Entry→Exit gate config: choose which camera is the entrance and which is the
 * exit. A "completed visit" is counted when the SAME recognized person is seen
 * on the entry camera and then the exit camera. Linking the person across the
 * two cameras requires cross-camera face matching, so this card also exposes the
 * CROSS_CAMERA_ENABLED toggle. Saves via PATCH /api/admin/settings (same
 * ADMIN_API_KEY path the Settings page uses).
 */
export function GateConfig() {
  const { mutate } = useSWRConfig();
  const { data: settings, error } = useSWR<AdminSettings>("admin/settings", fetcher);
  const { data: cameras } = useSWR<string[]>("admin/cameras", fetcher);

  const [enabled, setEnabled] = useState(false);
  const [entryCam, setEntryCam] = useState("");
  const [exitCam, setExitCam] = useState("");
  const [crossCam, setCrossCam] = useState(false);
  const [minDwell, setMinDwell] = useState("");
  const [maxDwell, setMaxDwell] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed local form state once from the backend's current values.
  useEffect(() => {
    if (!settings || seeded) return;
    setEnabled(Boolean(settings.GATE_COUNTING_ENABLED));
    setEntryCam(String(settings.ENTRY_CAMERA_ID ?? ""));
    setExitCam(String(settings.EXIT_CAMERA_ID ?? ""));
    setCrossCam(Boolean(settings.CROSS_CAMERA_ENABLED));
    setMinDwell(settings.GATE_MIN_DWELL_SECONDS != null ? String(settings.GATE_MIN_DWELL_SECONDS) : "");
    setMaxDwell(settings.GATE_MAX_DWELL_SECONDS != null ? String(settings.GATE_MAX_DWELL_SECONDS) : "");
    setSeeded(true);
  }, [settings, seeded]);

  const camOptions = [
    { value: "", label: "Select camera…" },
    ...(cameras ?? []).map((c) => ({ value: c, label: c })),
  ];

  async function save() {
    if (enabled && (!entryCam || !exitCam)) {
      setMsg("Choose both an entry and an exit camera.");
      return;
    }
    if (entryCam && entryCam === exitCam) {
      setMsg("Entry and exit cameras must be different.");
      return;
    }
    if (enabled && !crossCam) {
      setMsg("Enable cross-camera matching — it's required to link the person across cameras.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.patch("admin/settings", {
        updates: {
          GATE_COUNTING_ENABLED: enabled,
          ENTRY_CAMERA_ID: entryCam,
          EXIT_CAMERA_ID: exitCam,
          CROSS_CAMERA_ENABLED: crossCam,
          GATE_MIN_DWELL_SECONDS: minDwell ? Number(minDwell) : 0,
          GATE_MAX_DWELL_SECONDS: maxDwell ? Number(maxDwell) : 14400,
        },
      });
      await mutate("admin/settings");
      await mutate("analytics/gate");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle
        action={
          <Badge tone={enabled ? "success" : "neutral"}>
            <DoorOpen className="h-3 w-3" /> Entry/Exit Gate
          </Badge>
        }
      >
        Entry / Exit Visit Counting
      </CardTitle>
      <p className="mb-4 text-sm text-text-secondary">
        Count a <strong className="text-text-primary">completed visit</strong> when the same
        recognized person is seen on the entry camera and then the exit camera. Linking the
        person across cameras uses cross-camera face matching — keep it enabled below.
      </p>

      {error && (
        <p className="mb-3 text-sm text-text-muted">
          Settings unavailable — is <code className="text-primary">ADMIN_API_KEY</code> configured?
        </p>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Enable gate counting</span>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block text-sm">
            <span className="text-text-secondary">Entry camera</span>
            <div className="mt-1">
              <Select value={entryCam} options={camOptions} onChange={setEntryCam} />
            </div>
          </label>
          <div className="flex justify-center pb-2.5 text-text-muted">
            <ArrowRight className="h-4 w-4" />
          </div>
          <label className="block text-sm">
            <span className="text-text-secondary">Exit camera</span>
            <div className="mt-1">
              <Select value={exitCam} options={camOptions} onChange={setExitCam} />
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-text-secondary">Min dwell (s)</span>
            <div className="mt-1">
              <Input type="number" min={0} value={minDwell} onChange={setMinDwell} placeholder="0" />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Max dwell (s)</span>
            <div className="mt-1">
              <Input type="number" min={0} value={maxDwell} onChange={setMaxDwell} placeholder="14400" />
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between rounded-control bg-bg/40 px-3 py-2">
          <div className="pr-3">
            <p className="text-sm text-text-secondary">Cross-camera matching</p>
            <p className="text-xs text-text-muted">
              Required to recognize the same person across the two cameras.
            </p>
          </div>
          <Toggle checked={crossCam} onChange={setCrossCam} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy}>
            <Save className="h-4 w-4" />
            {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </Button>
          {msg && <p className="text-sm text-danger">{msg}</p>}
          {(cameras ?? []).length === 0 && !error && (
            <p className="text-sm text-text-muted">
              No cameras seen yet — start them on the Multicam page first.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
