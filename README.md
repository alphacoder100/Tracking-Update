# Restaurant Visitor Tracker

Auto-registering visitor detection, recognition, and analytics. Built on
FastAPI, PostgreSQL + pgvector, and CPU-based person/face recognition models
(YOLOv8n, ArcFace).

A webcam (or uploaded image/video) is processed at ~1 FPS: every person is
detected, first-time visitors are auto-registered, returning visitors are
recognised by their face gallery, and visit sessions / frequency are tracked
for the analytics API.

> ⚠️ **Privacy / legal.** This system stores **face biometrics** of people who
> have not actively enrolled. Automated biometric collection of patrons is
> regulated in many jurisdictions (EU GDPR, Illinois BIPA, etc.) and often
> requires notice and/or consent. Set `VISITOR_RETENTION_DAYS` to an
> appropriate purge window and confirm your legal posture before deploying.

## Architecture

```text
.
|-- backend/                       FastAPI application
|   |-- app/main.py                Lifespan, router mounting, health, background tasks
|   |-- app/config.py              Environment-based settings
|   |-- app/database.py            Async SQLAlchemy connection
|   |-- app/models.py              visitors / visitor_faces / visits / detection_events
|   |-- app/schemas.py             API request/response schemas
|   |-- app/ml_models.py           YOLOv8n + ArcFace (CPU/GPU singleton)
|   |-- app/cv_pipeline.py         Per-frame detection (YOLO -> ArcFace)
|   |-- app/utils.py               Media / frame / dedup / annotation helpers
|   |-- app/services/
|   |   |-- identity_resolver.py   NEW vs RETURNING decision (HNSW + ambiguity gate)
|   |   |-- auto_enroller.py       Gallery management + adaptive centroid
|   |   |-- visit_tracker.py       In-memory visit session state machine
|   |   |-- detection_pipeline.py  Resolve -> enroll -> track -> audit (shared)
|   |   |-- camera_service.py      Webcam/RTSP/file processing loop
|   |   `-- analytics_service.py   Analytics query builders
|   |-- app/api/                   detect / visitors / analytics / camera / admin / websocket
|   `-- alembic/                   Database migrations
|-- docker-compose.yml             Postgres, pgAdmin, backend
|-- init-db.sql                    Enables pgvector extension
`-- .env.example                   Example local configuration
```

| Service | URL / Port | Purpose |
| --- | --- | --- |
| Backend API | http://localhost:3001 | FastAPI service |
| Swagger UI | http://localhost:3001/docs | Interactive API docs |
| PostgreSQL | localhost:3004 | pgvector database |
| pgAdmin | http://localhost:3002 | Browser database UI |

## Quick Start

```bash
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
docker compose up --build -d
docker compose logs -f backend
```

First start downloads Python deps + model weights (YOLO, ArcFace buffalo_l) —
this can take several minutes. When ready:

- API docs: http://localhost:3001/docs
- Health:   http://localhost:3001/api/health

> **Webcam note.** Docker (especially on Windows/macOS) cannot access the host
> webcam. To test with a real webcam, run **Postgres in Docker** and the
> **backend natively** (see below), with `CAMERA_SOURCE=0`. The `/api/detect`
> upload endpoint works fully inside Docker without a camera.

## Single-worker requirement

The visit tracker keeps active sessions in process memory, so the app must run
with **one** uvicorn worker (the provided commands do). For horizontal
scale-out, move `VisitTracker.active_visits` to Redis.

## Database & migrations

The backend container runs `alembic upgrade head` before starting. Migration
`001_restaurant_schema` drops any legacy student-verification tables and creates
the four restaurant tables with pgvector HNSW indexes.

```bash
docker compose exec backend alembic upgrade head   # manual run
docker compose down -v && docker compose up --build -d   # full reset
```

## Authentication

All endpoints except `/api/health` and `/api/visitors/{id}/thumbnail` require:

```text
x-api-key: <API_KEY from .env>
```

## Key endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET`  | `/api/health` | Backend / model / DB / camera status |
| `POST` | `/api/detect` | Detect + auto-register + recognise in an uploaded image/video |
| `GET`  | `/api/visitors` | List visitors (filter, sort, paginate) |
| `GET`  | `/api/visitors/{id}` | Visitor detail + latest visit |
| `GET`  | `/api/visitors/{id}/visits` | Paginated visit history |
| `PUT`  | `/api/visitors/{id}` | Edit name / notes / staff flag |
| `DELETE` | `/api/visitors/{id}` | Soft delete (`?hard=true` to purge) |
| `GET`  | `/api/visitors/{id}/thumbnail` | Best face crop (JPEG) |
| `POST` | `/api/camera/start` | Start the camera loop |
| `POST` | `/api/camera/stop` | Stop the camera loop |
| `GET`  | `/api/camera/status` | Live camera stats |
| `GET`  | `/api/camera/snapshot` | Latest annotated frame (JPEG) |
| `WS`   | `/ws/live-feed` | Annotated frames + live stats stream |
| `GET`  | `/api/analytics/summary` | Visitors, visits, return rate, avg duration |
| `GET`  | `/api/analytics/frequency` | Visit-count distribution |
| `GET`  | `/api/analytics/hourly` | New vs returning by hour |
| `GET`  | `/api/analytics/top-visitors` | Most frequent visitors |
| `POST` | `/api/admin/visitors/{id}/merge` | Merge a duplicate into another visitor |
| `POST` | `/api/admin/visitors/{id}/mark-staff` | Flag/unflag as staff |

## Example requests

```bash
API_KEY=changeme-set-a-real-key

# Health
curl http://localhost:3001/api/health

# Detect from an image upload
curl -X POST http://localhost:3001/api/detect \
  -H "x-api-key: $API_KEY" \
  -F "file=@diner.jpg"

# Start the webcam (native run), then watch stats
curl -X POST http://localhost:3001/api/camera/start \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"source":"0"}'
curl -H "x-api-key: $API_KEY" http://localhost:3001/api/camera/status

# Analytics summary
curl -H "x-api-key: $API_KEY" http://localhost:3001/api/analytics/summary
```

## Running the backend natively (for webcam)

```bash
docker compose up -d postgres            # DB only
cp .env.example backend/.env             # set DATABASE_URL host to localhost
cd backend
python -m venv .venv && source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

PowerShell activation: `.\.venv\Scripts\Activate.ps1`

Set `CAMERA_AUTOSTART=true` to begin processing the webcam on startup, or call
`POST /api/camera/start`.

## Tuning thresholds

The recognition thresholds in `.env` (`RETURNING_FACE_THRESHOLD`,
`AMBIGUITY_MARGIN`, `NEW_VISITOR_MAX_SIMILARITY`, …) are sensible defaults for
ArcFace `buffalo_l` but **must be calibrated on your own camera footage** —
lighting, angle, and distance shift the similarity distribution. Start by
reviewing `detection_events` (ambiguous/new/returning counts) and the
`/api/analytics/*` outputs.

## Dashboard

The Next.js dashboard lives in [`dashboard/`](dashboard/) and implements all
seven pages (Live Monitor, Visitor Directory, Profile, Analytics, Activity,
Camera, Settings). It runs on **port 3003** and proxies REST calls to the
backend server-side (the API key never reaches the browser); the live feed is a
direct WebSocket to the backend.

- Docker: `docker compose up --build -d` starts it alongside Postgres + backend.
- Native: `cd dashboard && cp .env.local.example .env.local && npm install && npm run dev`

See [dashboard/README.md](dashboard/README.md) for details. Set the same
`API_KEY` in the root `.env` and the dashboard env so the proxy authenticates.
```
