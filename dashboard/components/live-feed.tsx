"use client";

import { useEffect, useRef, useState } from "react";
import { Video, VideoOff } from "lucide-react";

import { api } from "@/lib/api";
import type { LiveFeedMessage } from "@/lib/types";

export function LiveFeed({
  onMessage,
}: {
  onMessage?: (msg: LiveFeedMessage) => void;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [running, setRunning] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;
    let closed = false;

    const poll = async () => {
      if (closed) return;
      try {
        // Get camera status and latest snapshot
        const status = await api.get<any>("camera/status");
        setRunning(status.is_running);

        if (status.is_running) {
          // Fetch latest snapshot
          const timestamp = Date.now();
          const snapshotUrl = `/api/backend/camera/snapshot?t=${timestamp}`;
          const response = await fetch(snapshotUrl);
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = URL.createObjectURL(blob);
            setFrame(dataUrl);

            // Emit message for compatibility
            const msg: LiveFeedMessage = {
              type: "frame",
              is_running: true,
              frame: dataUrl,
              currently_inside: 0,
              stats: status.stats || {},
            };
            onMessageRef.current?.(msg);
          }
        } else {
          setFrame(null);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    // Poll every 500ms (roughly 2 FPS)
    pollInterval = setInterval(poll, 500);
    poll(); // Initial poll

    return () => {
      closed = true;
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card border border-card/60 bg-black">
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="Live camera feed" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-text-secondary">
          {running ? <Video className="h-8 w-8" /> : <VideoOff className="h-8 w-8" />}
          <p className="text-sm">
            {connected
              ? running
                ? "Waiting for frames…"
                : "Camera stopped — start it from the Camera page."
              : "Connecting to live feed…"}
          </p>
        </div>
      )}
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs">
        <span
          className={`h-2 w-2 rounded-full ${
            connected && running ? "bg-success animate-pulse" : "bg-danger"
          }`}
        />
        {connected ? (running ? "LIVE" : "IDLE") : "OFFLINE"}
      </div>
    </div>
  );
}
