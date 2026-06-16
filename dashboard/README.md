# Restaurant Tracker — Dashboard

Next.js 14 (App Router) + TailwindCSS + Recharts admin dashboard for the
Restaurant Visitor Tracker backend.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | **Live Monitor** — WebSocket camera feed, live stats, recent activity |
| `/visitors` | **Directory** — searchable/sortable/paginated visitor table |
| `/visitors/[id]` | **Profile** — stats, monthly frequency chart, visit history, edit/merge/delete |
| `/analytics` | **Analytics** — summary cards, daily area, new-vs-returning donut, hourly, frequency, top regulars |
| `/activity` | **Activity Timeline** — filterable event log with auto-refresh |
| `/camera` | **Camera** — start/stop, status, latest snapshot |
| `/settings` | **Settings** — read-only view of the backend's active configuration |

## How it talks to the backend

The browser never holds the API key. All REST calls go to the same-origin Next
route handler **`/api/backend/*`** (`app/api/backend/[...path]/route.ts`), which
forwards to the FastAPI backend with the `x-api-key` header injected from a
server-only env var. The live feed is a direct browser→backend WebSocket
(`/ws/live-feed`, which is unauthenticated by design).

```
Browser ──fetch──▶ /api/backend/*  ──(+x-api-key)──▶  FastAPI  (REST)
Browser ──WebSocket───────────────────────────────▶  FastAPI  (/ws/live-feed)
```

## Run natively

```bash
cd dashboard
cp .env.local.example .env.local     # set BACKEND_URL + API_KEY to match the backend
npm install
npm run dev                          # http://localhost:3003
```

Required env (`.env.local`):

| Var | Meaning |
| --- | --- |
| `BACKEND_URL` | Server-side proxy target (e.g. `http://localhost:3001`) |
| `API_KEY` | Must match the backend `API_KEY` |
| `NEXT_PUBLIC_WS_URL` | Live-feed WS URL the browser connects to (e.g. `ws://localhost:3001/ws/live-feed`) |

## Run with Docker

`docker compose up --build -d` brings up Postgres, the backend, and this
dashboard together. Ports: dashboard **3003**, backend **3001**, pgAdmin
**3002**, PostgreSQL **3004**. Set `API_KEY` in the root `.env` so it matches
across services.

> The live feed needs the backend's camera running. In Docker the camera loop
> can't see a host webcam — use the `/api/detect` upload or run the backend
> natively for a real webcam (see the root README).

## Design system

Dark theme from plan §9.2 (slate background, blue primary, violet accent),
Inter font, 12px card / 8px control radii. Components live in `components/`;
the typed API client + interfaces are in `lib/`.

## Notes / deviations

- **shadcn/ui was not used.** Lightweight Tailwind components
  (`components/ui.tsx`) provide the same primitives without a generator step, so
  `npm install` is the only setup.
- **Settings is read-only.** Backend settings are env-driven and loaded at
  startup; a live editor would need a writable settings store on the backend.
- Per-row `•••` action menus from the wireframe are consolidated into the
  Profile page (edit/merge/delete/staff) to keep the table clean.
