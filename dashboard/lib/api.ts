// Browser-side API client. All calls go through the same-origin Next proxy
// (/api/backend/*), which injects the API key server-side. Image URLs
// (thumbnails) are also served via the proxy so the key stays private.

const PROXY = "/api/backend";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Turn a FastAPI error body into a readable string. 422 responses put a list
 *  of {loc, msg, type} objects under `detail`, which would otherwise render as
 *  "[object Object]". */
function extractDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const d = (body as { detail?: unknown; error?: unknown }).detail ??
    (body as { error?: unknown }).error;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const parts = d.map((e) => {
      if (e && typeof e === "object") {
        const err = e as { msg?: string; loc?: unknown[] };
        const where = Array.isArray(err.loc) ? err.loc.slice(1).join(".") : "";
        return where ? `${where}: ${err.msg ?? ""}`.trim() : err.msg ?? JSON.stringify(e);
      }
      return String(e);
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (typeof d === "object") {
    return (d as { msg?: string }).msg || JSON.stringify(d);
  }
  return String(d);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY}/${path}`, { ...init, cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = extractDetail(await res.json(), res.statusText);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// SWR fetcher (path relative to the proxy root).
export const fetcher = <T>(path: string) => request<T>(path);

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};

// Build a same-origin image URL (thumbnail/snapshot) routed through the proxy.
export function imageUrl(backendPath: string): string {
  return `${PROXY}/${backendPath.replace(/^\/?api\//, "")}`;
}

// Direct WebSocket URL to the backend (not proxied — WS auth is open).
export function liveFeedUrl(): string {
  if (typeof window === "undefined") return "";

  // Backend is running on host machine (localhost:8000), not in Docker
  // Construct the WebSocket URL dynamically based on the current location
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname; // e.g., localhost
  return `${protocol}://${host}:8000/ws/live-feed`;
}
