"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Radio, Video, VideoOff } from "lucide-react";

import { api } from "@/lib/api";
import type { CameraStatus } from "@/lib/types";

/**
 * Polls the backend annotated snapshot (bounding boxes + recognition labels
 * drawn server-side) and renders it as a live feed. Works identically for a
 * webcam and an uploaded video file streamed through the camera service.
 *
 * The live *preview* is opt-in via a Start/Stop button. Detection always runs
 * on the backend (visitor counts keep updating), but the CPU-heavy frame
 * encoding + snapshot polling only happen while the view is started — so an
 * idle camera you're not watching costs almost no CPU. `defaultStreaming`
 * starts it on immediately (used by the enlarged zoom view).
 */
export function DetectionFeed({
  onStatus,
  pollMs = 350,
  cameraId,
  defaultStreaming = false,
}: {
  onStatus?: (s: CameraStatus) => void;
  pollMs?: number;
  cameraId?: string;
  defaultStreaming?: boolean;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [streaming, setStreaming] = useState(defaultStreaming);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    let closed = false;
    const camParam = cameraId ? `camera_id=${encodeURIComponent(cameraId)}` : "";

    const poll = async () => {
      if (closed) return;
      try {
        const s = await api.get<CameraStatus>(
          `camera/status${camParam ? `?${camParam}` : ""}`,
        );
        setStatus(s);
        onStatusRef.current?.(s);

        // Only pull frames (encode + transfer) while the view is started.
        if (s.is_running && streaming) {
          const res = await fetch(
            `/api/backend/camera/snapshot?t=${Date.now()}${camParam ? `&${camParam}` : ""}`,
          );
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setFrame(url);
            if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
            lastUrl.current = url;
          }
        } else {
          setFrame(null);
        }
      } catch {
        /* transient — keep last frame */
      }
    };

    const id = setInterval(poll, pollMs);
    poll();
    return () => {
      closed = true;
      clearInterval(id);
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    };
  }, [pollMs, cameraId, streaming]);

  const running = status?.is_running;
  const isVideo = status?.source_kind === "video";

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card border border-white/10 bg-black shadow-card">
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="Detection feed" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
          {running && streaming ? (
            <Loader2 className="h-9 w-9 animate-spin" />
          ) : running ? (
            // Camera is running but preview is paused — offer to start it.
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStreaming(true);
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:brightness-110"
              >
                <Play className="h-4 w-4 fill-current" /> Start Live View
              </button>
              <p className="text-xs">Detection is running · preview paused to save CPU</p>
            </>
          ) : (
            <>
              <VideoOff className="h-9 w-9" />
              <p className="text-sm">No active stream.</p>
            </>
          )}
        </div>
      )}

      {/* Status pill */}
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-medium backdrop-blur">
        <span
          className={`h-2 w-2 rounded-full ${
            running ? (streaming ? "animate-pulse bg-success" : "bg-warning") : "bg-danger"
          }`}
        />
        {running
          ? streaming
            ? isVideo
              ? "STREAMING VIDEO"
              : "LIVE"
            : "PAUSED"
          : "OFFLINE"}
        {status?.looping && running && (
          <span className="text-text-muted">· loop</span>
        )}
      </div>

      {/* Stop button (while streaming) / FPS pill */}
      {running && (
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {streaming && (
            <>
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-text-secondary backdrop-blur">
                <Video className="h-3 w-3" />
                {status?.fps ?? "—"} fps
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setStreaming(false);
                }}
                title="Stop live view (keeps detection running)"
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-medium text-text-secondary backdrop-blur transition hover:text-text-primary"
              >
                <Radio className="h-3 w-3" /> Stop
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
