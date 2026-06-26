# Project Optimization & Risk Plan

**Project:** Restaurant Visitor Tracker (FastAPI + PostgreSQL/pgvector + Next.js, YOLOv8n + ArcFace)
**Date:** 2026-06-26
**Scope:** A *whole-system* catalog of problems that can occur in production and how to fix them, plus a prioritized plan to make the full stack faster, safer, and more reliable.

> This document is **broader** than the two existing plans, which are narrowly about
> recognition accuracy and de-duplication:
> - [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md) — HNSW `ef_search`, tracklet fast-path, ArcFace fallback gating.
> - [ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md](ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md) — face-only dedup strategy.
>
> Where those already cover an item, this doc references them instead of repeating.
> Everything else (deployment, DB lifecycle, concurrency, security, privacy,
> observability, frontend, reliability) is new here.

---

## 0. How to read this

Each problem below uses a fixed shape:

> **Problem** — what goes wrong · **Impact** — who/what it hurts · **Where** — file/config · **Fix** — concrete action

Two scoring tags:
- **Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low
- **Effort:** S (hours) · M (1–3 days) · L (week+)

A consolidated, prioritized roadmap is in [§11](#11-prioritized-roadmap). If you only do
five things, do the **Quick Wins** table in [§12](#12-quick-wins).

---

## 1. System map (1-minute recap)

```
Camera / RTSP / upload
      │  (1 FPS, frame-dedup, ROI crop, long-side cap)
      ▼
cv_pipeline.process_frame ──► YOLOv8n (persons) + ArcFace buffalo_l (faces, embedding cache)
      ▼
detection_pipeline.process_detections
      ├─ tracklet fast-path (skip gallery search for pinned visitors)
      ├─ identity_resolver.resolve_batch ──► pgvector HNSW gallery search (visitor_faces)
      ├─ mask / periocular re-resolve, temporal gate, cross-camera
      ├─ auto_enroller.update_after_match / register_new_visitor (gallery + centroid + thumbnail)
      └─ VisitTracker / GateVisitTracker + DetectionEvent audit  ──► one COMMIT per frame
      ▼
PostgreSQL 16 + pgvector (HNSW)   +   in-process state (visit/gate/tracklet/temporal/cache)
      ▼
Next.js dashboard ──(server-side proxy, x-api-key)──► FastAPI;  live feed = direct WebSocket
```

**Single-process constraint:** visit sessions, gate passes, tracklets, the temporal
gate, and the embedding cache all live in **process memory** → the backend must run
**one** uvicorn worker. This is the root of most scaling limits below.

---

## 2. Compute / CV pipeline performance

### 2.1 🟠 Blocking disk I/O on the event loop · Effort S
**Problem.** Thumbnail and gallery-crop writes use synchronous `cv2.imwrite` called
directly from async code, not off-loaded to a thread.
**Where.** [auto_enroller.py](backend/app/services/auto_enroller.py) `_save_thumbnail`, `_save_face_crop` — invoked from `update_after_match` / `register_new_visitor`, which run inside the awaited `process_detections` on the event loop.
**Impact.** Every confident match / new visitor stalls the single event loop on a JPEG encode + disk write, throttling *all* concurrent cameras and the live feed.
**Fix.** Wrap crop/thumbnail persistence in `asyncio.to_thread(...)`, or batch them in a background writer queue. Skip writing a crop when `DETECT_SAVE_FRAMES`-style persistence isn't needed.

### 2.2 🟠 Per-match DB round-trips on the hot path · Effort M
**Problem.** A confident returning match issues multiple sequential gallery `SELECT`s
(diversity check, gallery add/evict, adaptive-threshold recompute).
**Where.** `update_after_match` in [auto_enroller.py](backend/app/services/auto_enroller.py); already partially mitigated by the `existing_faces` parameter.
**Impact.** 2–3 round-trips per returning visitor per frame; multiplies across a busy seated room.
**Fix.** This is **IMPROVEMENT_PLAN §2.1** — finish threading a single gallery fetch through diversity + eviction + threshold recompute on *all* call sites. The plumbing (`existing_faces`) exists; ensure every path passes it.

### 2.3 🟡 Masked-face second ArcFace pass + second resolve · Effort M
**Problem.** Each masked face triggers an extra periocular ArcFace embed and a *second* `resolve_batch`.
**Where.** [detection_pipeline.py](backend/app/services/detection_pipeline.py) mask block.
**Impact.** In a masked crowd this doubles the dominant per-frame cost.
**Fix.** **IMPROVEMENT_PLAN §2.2** — batch periocular embeds across all masked faces (partly done) and fully short-circuit `is_masked()` when `MASK_DETECTION_ENABLED=false`.

### 2.4 🟡 Detector input size is fixed at the slowest setting · Effort M
**Problem.** `INSIGHTFACE_DET_SIZE=640` maximizes small-face recall but is the slowest.
**Impact.** 1.5–4× more ArcFace cost than needed for close/medium-range single-camera footage.
**Fix.** **IMPROVEMENT_PLAN §2.5 / ADVANCED §3C** — auto-pick 320/480/640 from median detected face size over a warmup window; expose as a runtime setting.

### 2.5 🟡 Per-person ArcFace fallback in crowds · Effort S — *already gated*
**Status.** Handled by `PER_PERSON_FACE_FALLBACK` (default `true`). Set `false` for
close-range deployments to cut crowd-frame latency (**IMPROVEMENT_PLAN §1.2**).

### 2.6 🟡 CPU-only by default; GPU path exists but unused · Effort M
**Problem.** `DEVICE=auto` falls back to CPU; ArcFace on CPU at 640 is the throughput ceiling.
**Fix.** Where a CUDA GPU exists, install `onnxruntime-gpu` + CUDA torch and set `DEVICE=cuda`. The live CPU↔GPU switch and `CUDA_VISIBLE_DEVICES` hazards are already handled in [ml_models.py](backend/app/ml_models.py). Document the GPU image variant in `requirements`/Dockerfile.

### 2.7 ⚪ Embedding cache is per-worker, per-stream · Effort S
**Note.** `FaceEmbeddingCache` is created fresh per inference worker ([camera_service.py](backend/app/services/camera_service.py)). It is correctly LRU+TTL bounded (`FACE_CACHE_MAX_ENTRIES`, `FACE_CACHE_TTL_SECONDS`). No action needed beyond confirming the bound fits RAM (~20 MB / 10k entries) × number of cameras.

---

## 3. Recognition accuracy & duplicate visitors

This domain is **already well covered** — see both existing plans. Summary of the
live safeguards (preserve them): grey-zone hold, ambiguity gate, registration pose
gate, tracklet buffering, pose-aware gallery, adaptive per-visitor thresholds,
contamination guard, cross-camera review queue.

Open items still worth tracking here:

| Item | Severity | Pointer |
| --- | --- | --- |
| HNSW `ef_search` recall on filtered search | 🟠 | **IMPLEMENTED** — `HNSW_EF_SEARCH=100` (IMPROVEMENT_PLAN §1.1) |
| Thresholds must be calibrated on real footage | 🟠 | `.env` thresholds are *starting points only*; calibrate from `detection_events` |
| Persist `ef_search` at DB/role level | 🟡 | IMPROVEMENT_PLAN §2.3 (belt-and-suspenders) |
| Evaluate AdaFace vs ArcFace for pose robustness | 🟡 | IMPROVEMENT_PLAN §2.6 — *measure first* |

**Action:** add a small **calibration notebook/script** that reads `detection_events`
(new/returning/grey_zone/ambiguous/pose_hold counts + similarity histograms) and
suggests threshold deltas, so tuning is data-driven rather than guesswork.

---

## 4. Database & storage lifecycle

### 4.1 🟠 `detection_events` grows without a retention policy · Effort S
**Problem.** One audit row per detection. At 1 FPS × N cameras × 12h/day this is
millions of rows/month. Migration `004_partition_detection_events` partitions the
table (good) but nothing **drops old partitions**.
**Impact.** Unbounded table/disk growth; analytics and dedup sweeps slow over time.
**Fix.** Add a retention job that detaches/drops partitions older than X days
(mirror the existing `_retention_loop` pattern in [main.py](backend/app/main.py)). Expose `DETECTION_EVENT_RETENTION_DAYS`.

### 4.2 🟠 Visitor retention purge is a hard `DELETE`, off by default · Effort S
**Problem.** `_retention_loop` is disabled when `VISITOR_RETENTION_DAYS=0` (the default),
and when on it issues a single unbatched `DELETE`.
**Impact.** (a) Biometric data is kept forever by default — a compliance risk (see §7).
(b) A large purge can lock/bloat the table.
**Fix.** Ship a non-zero default appropriate to your jurisdiction; batch the delete
(`DELETE ... WHERE id IN (SELECT ... LIMIT 1000)` loop) and `VACUUM`-friendly cadence.

### 4.3 🟡 Connection-pool sizing vs per-frame sessions · Effort S
**Problem.** `pool_size=10, max_overflow=20` ([database.py](backend/app/database.py)). Each camera consumer opens a session **per processed frame**, plus background loops (stale/retention/auto-tune/cross-camera/monitoring) each open their own.
**Impact.** Many cameras + bursts can exhaust the pool → `TimeoutError` on checkout.
**Fix.** Size the pool to `(cameras × in-flight frames) + background loops + headroom`; consider a dedicated small pool for background loops. Keep sessions short (already mostly true).

### 4.4 🟡 Thumbnails/crops on local disk, not addressable storage · Effort M
**Problem.** `VISITOR_PHOTO_DIR`/crops are written to a container-local path. With the
live bind-mount this survives, but it is not backed up, not shared across hosts, and
grows with the gallery.
**Fix.** For multi-host or durable deployments, write crops to object storage (S3/MinIO)
or a mounted volume with a documented backup; add a size cap / cleanup tied to gallery eviction.

### 4.5 🟡 No documented backup / migration-rollback story · Effort S
**Fix.** Document `pg_dump` schedule for the `pgdata` volume, and confirm each Alembic
migration has a working `downgrade`. The chain is `001 → 013`; the new
`013_remove_body_embeddings` should be reviewed for a safe down-path.

### 4.6 ⚪ `init_db()` only ensures the extension; schema via Alembic · Effort — *fine*
**Note.** `CREATE EXTENSION IF NOT EXISTS vector` runs on startup; tables come from
`alembic upgrade head` in the container command. Keep these in sync — don't add
`Base.metadata.create_all` anywhere or it will diverge from migrations.

---

## 5. Concurrency, scalability & state

### 5.1 🔴 Single-worker ceiling (in-process state) · Effort L
**Problem.** `VisitTracker`, `GateVisitTracker`, `tracklet_buffer`, `temporal_gate`,
and the embedding cache are all in-process singletons. The app **cannot** run multiple
uvicorn workers or scale horizontally without double-counting visits / losing tracklets.
**Where.** [visit_tracker.py](backend/app/services/visit_tracker.py), [gate_tracker.py](backend/app/services/gate_tracker.py), [tracklet.py](backend/app/services/tracklet.py), [temporal_consistency.py](backend/app/services/temporal_consistency.py); Redis exists only for the visit tracker ([redis_visit_tracker.py](backend/app/services/redis_visit_tracker.py)).
**Impact.** Throughput is capped by one process; a crash loses all open visits except
what `recover_active`/`recover_open` rebuild from the DB.
**Fix (phased):**
1. **Short term:** accept single-worker; document it (already in README) and make the
   process robust (auto-restart, health checks — see §9).
2. **Medium term:** move *all* shared state behind Redis (not just visits): tracklet
   pins, temporal window, gate passes. Then `INFERENCE_WORKERS>1` and multi-worker
   become safe.
3. **Long term:** split capture+inference (stateless, scalable) from the
   identity/visit reducer (single consumer or partitioned-by-camera).

### 5.2 🟠 `INFERENCE_WORKERS>1` shares non-thread-safe models · Effort M
**Problem.** Raising `INFERENCE_WORKERS` shares one YOLO/InsightFace object across
threads; these are not guaranteed thread-safe (documented in [config.py](backend/app/config.py)).
**Fix.** Give each worker its own model instances before raising it, or keep at 1 and
scale via GPU. Don't raise `INFERENCE_WORKERS`/`INFERENCE_MAX_CONCURRENCY` blindly.

### 5.3 🟡 One DB commit per frame holds a transaction across heavy work · Effort M
**Problem.** `process_detections` does resolve + enroll + visit-track + audit then a
single `await db.commit()`. Within that span it awaits multiple queries and (today)
blocking disk writes.
**Impact.** Long-held transactions increase lock contention and connection hold time.
**Fix.** Combine with §2.1/§2.2 (remove blocking I/O, fewer round-trips). Consider
committing the audit event separately from identity mutation so a slow audit can't
extend the identity transaction.

---

## 6. Backend correctness & API hygiene

### 6.1 🟠 CORS middleware is fully commented out · Effort S
**Problem.** The `CORSMiddleware` block is disabled "for WebSocket debugging," so
`CORS_ORIGINS` in config is **unused**.
**Where.** [main.py](backend/app/main.py) lines ~236–244.
**Impact.** Any *direct* browser→backend REST call is blocked; today this is masked
because the dashboard proxies server-side, but it's a latent footgun and the comment
implies an unresolved WS issue.
**Fix.** Re-enable CORS scoped to `settings.CORS_ORIGINS` (not `*` with credentials).
WebSocket upgrades aren't subject to CORS the same way — handle WS origin checks
explicitly instead of disabling CORS globally.

### 6.2 🟠 No upload abuse / rate limiting on `/api/detect` · Effort M
**Problem.** Video uploads up to `VIDEO_MAX_SIZE_MB=100` / 60 s are accepted with only
an API key; no per-key rate limit or concurrency cap on the heavy decode+inference path.
**Impact.** A single key can saturate CPU/GPU (DoS) or fill `DETECT_TMP_DIR`.
**Fix.** Add a rate limiter (e.g. slowapi / reverse-proxy limit) and a global semaphore
on `/api/detect`; ensure `DETECT_TMP_DIR` is always cleaned on error paths.

### 6.3 🟡 Single shared API key, non-constant-time compare · Effort S
**Problem.** All clients share one `API_KEY`; comparison is `api_key != settings.API_KEY`
([api/__init__.py](backend/app/api/__init__.py)), not constant-time; `auto_error=False`.
**Impact.** No per-client revocation/rotation; theoretical timing side-channel.
**Fix.** Use `hmac.compare_digest`; consider per-client keys or JWT if multi-tenant.
**Verify** WebSocket `/ws/live-feed` enforces auth (the live feed streams faces — it
must not be world-readable).

### 6.4 🟡 `extra = "ignore"` silently drops unknown env vars · Effort S
**Problem.** A typo'd setting in `.env` is ignored, not flagged ([config.py](backend/app/config.py) `Config.extra`).
**Fix.** Log a warning for unrecognized keys at startup, or switch to `extra="forbid"`
in a validation pass so misconfig is caught early.

### 6.5 ⚪ Runtime settings patched via `object.__setattr__` · Effort — *note*
**Note.** Live config changes mutate the frozen `settings` singleton directly
([main.py](backend/app/main.py), admin_config). Works, but means some settings are read
once (env, thread counts) and others live — document which knobs are hot-reloadable vs
require restart.

---

## 7. Security & privacy / compliance

### 7.1 🔴 Weak default secrets shipped in config · Effort S
**Problem.** Defaults: `API_KEY=changeme-set-a-real-key`, Postgres `tracker/tracker_pass`,
pgAdmin `admin@admin.com / admin`. The proxy also defaults `API_KEY` to the same string.
**Where.** [.env.example](.env.example), [docker-compose.yml](docker-compose.yml), [route.ts](dashboard/app/api/backend/[...path]/route.ts).
**Fix.** Fail startup if `API_KEY` is still the default in a non-dev environment;
require real secrets via env/secret manager; never bake defaults into compose for prod.

### 7.2 🔴 `privileged: true` + live source bind-mount + `--reload` in compose · Effort S
**Problem.** The backend container runs **privileged**, bind-mounts source, and runs
uvicorn with `--reload` — all dev conveniences in a `restart: unless-stopped` service.
**Where.** [docker-compose.yml](docker-compose.yml).
**Impact.** `privileged` grants broad host access (container escape risk); `--reload`
and source mounts are not production-safe.
**Fix.** Split `docker-compose.dev.yml` (privileged/reload/mount) from a hardened prod
compose: drop `privileged` (pass only the specific `/dev/video0` device), bake code into
the image, run `uvicorn` without `--reload`, add read-only FS where possible.

### 7.3 🟠 Face biometrics of non-enrolled patrons stored by default · Effort M
**Problem.** The system auto-enrolls biometric embeddings of everyone, retention off by
default (`VISITOR_RETENTION_DAYS=0`). This is regulated (GDPR / Illinois BIPA / etc.).
**Where.** README warning; [config.py](backend/app/config.py) retention + consent fields.
**Fix.** Treat as a launch blocker: set a real retention window, wire the consent fields
(`DEFAULT_CONSENT_MODE`, `CONSENT_NOTICE_TEXT`, opt-out → `OPTED_OUT_EMBEDDING_TTL_DAYS`)
into an actual workflow, post physical notice, and document legal posture. Confirm the
opted-out purge path actually runs.

### 7.4 🟡 Secrets/large artifacts in the working tree · Effort S
**Problem.** `backend/venv/`, `dashboard/node_modules/`, and model weights
(`yolov8n.pt/.onnx`, `backend/models/`) are present in the tree.
**Fix.** Ensure all are `.gitignore`d (they should not be committed); fetch model
weights at build time or store via Git LFS. Verify no `.env` is tracked.

### 7.5 🟡 Thumbnail endpoint is unauthenticated by design · Effort S
**Problem.** README states `/api/visitors/{id}/thumbnail` needs no key.
**Impact.** Anyone who can guess/enumerate a visitor UUID can fetch a face crop.
**Fix.** UUIDs are unguessable in practice, but if the backend is internet-reachable,
require auth (or a signed, expiring URL) for face imagery.

---

## 8. Configuration & documentation drift

### 8.1 🟠 Port/URL drift across config, compose, and README · Effort S
**Problem.** Inconsistent ports everywhere:
- `config.py` default DB port **3018**; `.env.example` **3004**; compose maps Postgres host **3018**.
- README lists Backend **3001**, Swagger **3001/docs**, Postgres **3004**, pgAdmin **3002**, dashboard **3003**.
- `docker-compose.yml` actually uses Backend **3016**, dashboard **3017**, pgAdmin **3015**, Postgres **3018**, Redis **3019**.
**Impact.** New devs/operators follow the README and nothing connects; copy-paste curl
examples fail.
**Fix.** Pick one source of truth (compose), regenerate the README port table + Quick
Start, and align `.env.example` `DATABASE_URL` with the compose-exposed port. Add a
"ports" section that's generated/checked in CI.

### 8.2 🟡 README architecture references deleted modules · Effort S
**Problem.** README's architecture tree lists `app/osnet.py` and
`services/cascade_pipeline.py`, both **deleted** (per git status / body-Re-ID removal).
**Fix.** Update the README tree to match the current `app/` layout (geometry,
similarity, services/{tracklet,temporal_consistency,cross_camera,gate_tracker,…}).

### 8.3 🟡 `.env.example` is missing many live settings · Effort S
**Problem.** `config.py` has dozens of knobs (tracklet fast-path, adaptive thresholds,
cross-camera bands, gate counting, consent, auto-tuning, monitoring) not reflected in
`.env.example`.
**Fix.** Regenerate `.env.example` from the `Settings` model (or a `--print-config`
command) so operators can see every tunable with its default and a one-line doc.

---

## 9. Observability, reliability & operations

### 9.1 🟠 Metrics exist but no dashboards/alerting wired · Effort M
**Problem.** `record_frame_latency` + a monitoring loop exist ([monitoring.py](backend/app/monitoring.py)), and `ALERT_WEBHOOK_URL` is a config field, but there's no Prometheus/Grafana export or documented alert rules.
**Fix.** Expose `/metrics` (Prometheus) for frame latency, frames processed/skipped,
new vs returning rate, grey-zone/ambiguous/pose-hold counts, DB pool usage, queue
depths. Wire `ALERT_WEBHOOK_URL` to fire on camera-down / latency-spike / DB-error.

### 9.2 🟠 Background loops swallow errors and may silently die · Effort S
**Problem.** Each `_spawn`'d loop catches broadly and logs a warning; a loop that
crashes outside the try (or a cancelled task) just disappears. Camera `last_error`
is surfaced but a dead background loop isn't alerted.
**Where.** [main.py](backend/app/main.py) loops; pipeline tasks in [camera_service.py](backend/app/services/camera_service.py).
**Fix.** Add supervised restart (re-spawn on unexpected exit with backoff) and surface
loop liveness in `/api/health` (last-run timestamps for stale/retention/auto-tune/recon).

### 9.3 🟡 Health check is shallow · Effort S
**Problem.** `/api/health` reports DB+models+camera-running, but not pipeline latency,
queue backpressure, GPU memory, or background-loop liveness.
**Fix.** Extend `HealthResponse` with frame-latency p95, frames_skipped ratio, GPU info
(already available via `gpu_info()`), and loop heartbeats. Drives §9.1 alerts.

### 9.4 🟡 No structured logging / request correlation · Effort M
**Fix.** Switch to structured (JSON) logs with a request/camera/frame id, so per-frame
DEBUG timings (`process_frame`, `Frame timing`) are queryable in aggregate.

### 9.5 🟡 RTSP camera resilience · Effort M
**Problem.** Capture retries on read failure with a fixed `sleep(0.05)`; a camera that
drops for minutes spins without backoff or a "camera unhealthy" signal beyond `last_error`.
**Where.** [camera_service.py](backend/app/services/camera_service.py) `_capture_loop`.
**Fix.** Exponential backoff + auto-reconnect with a bounded attempt counter, and emit
an alert when a camera is down past a threshold.

---

## 10. Frontend / dashboard

### 10.1 🟡 Live feed is a direct browser→backend WebSocket · Effort M
**Problem.** REST goes through the authenticated server-side proxy, but the live feed
connects directly (`NEXT_PUBLIC_WS_URL=ws://localhost:8000/...`).
**Impact.** Bypasses the proxy's auth model; the WS endpoint must enforce its own auth
and origin checks (ties to §6.3/§7.5). Also `ws://` is unencrypted.
**Fix.** Authenticate the WS (token in subprotocol/query), use `wss://` behind TLS, and
restrict origins.

### 10.2 🟡 `node_modules` bind-mounted; build vs dev parity · Effort S
**Problem.** Compose mounts `./dashboard` with an anonymous `/app/node_modules` volume —
a dev pattern. No prod build/runtime split shown.
**Fix.** Add a multi-stage Dockerfile (`next build` → minimal runtime) for prod; keep
the mount only in the dev compose.

### 10.3 ⚪ Proxy default backend URL is stale · Effort S
**Note.** [route.ts](dashboard/app/api/backend/[...path]/route.ts) defaults `BACKEND_URL` to `http://localhost:3001`, but compose sets `host.docker.internal:8000`. Harmless when the env var is set, but the default contributes to the §8.1 drift — align it.

---

## 11. Prioritized roadmap

### Phase 0 — Make it safe to deploy (days)
- 7.1 Enforce non-default secrets; 7.2 split dev/prod compose (drop `privileged`, `--reload`).
- 6.1 Re-enable scoped CORS; 6.3 constant-time key compare + verify WS auth (10.1).
- 8.1/8.2/8.3 Fix port/doc drift and regenerate `.env.example` + README.
- 7.3 Decide & set retention + consent posture (compliance gate).

### Phase 1 — Hot-path performance (days–1 wk)
- 2.1 Off-load crop/thumbnail writes (biggest single event-loop unblock).
- 2.2 Single gallery fetch through the enroller (IMPROVEMENT_PLAN §2.1).
- 2.3 Batch masked/periocular; short-circuit when disabled.
- 2.4 Detector input-size auto-select.
- Enable `TRACKLET_FAST_PATH` after validation (already shipped, opt-in).

### Phase 2 — Data lifecycle & reliability (1 wk)
- 4.1 `detection_events` partition retention; 4.2 batched visitor purge.
- 9.1/9.3 Prometheus `/metrics` + deeper health; 9.2 supervised loops; 9.5 RTSP backoff.
- 4.3 Right-size the connection pool; 4.5 backup + migration-rollback docs.

### Phase 3 — Scale-out (1–3 wks, only if needed)
- 5.1 Move all shared state to Redis; 5.2 per-worker models → `INFERENCE_WORKERS>1`.
- 2.6 GPU image + `DEVICE=cuda`.
- 5.3 Split audit vs identity transactions; consider capture/inference vs reducer split.

### Phase 4 — Accuracy hardening (ongoing, see existing plans)
- Threshold calibration script (§3); evaluate AdaFace *after* measurement.

---

## 12. Quick wins

| # | Change | Severity | Effort | File |
| - | --- | --- | --- | --- |
| 1 | `asyncio.to_thread` around `cv2.imwrite` (thumbnail/crop) | 🟠 | S | [auto_enroller.py](backend/app/services/auto_enroller.py) |
| 2 | Re-enable CORS scoped to `CORS_ORIGINS` | 🟠 | S | [main.py](backend/app/main.py) |
| 3 | `hmac.compare_digest` for API key; verify WS auth | 🟡 | S | [api/__init__.py](backend/app/api/__init__.py) |
| 4 | Fail fast if `API_KEY`/DB password are defaults (prod) | 🔴 | S | [config.py](backend/app/config.py) |
| 5 | Remove `privileged`/`--reload` from prod compose | 🔴 | S | [docker-compose.yml](docker-compose.yml) |
| 6 | Fix README/`.env`/compose port drift | 🟠 | S | README / .env.example / compose |
| 7 | `detection_events` partition-drop retention job | 🟠 | S | [main.py](backend/app/main.py) |
| 8 | Set a real `VISITOR_RETENTION_DAYS` + batch purge | 🟠 | S | [config.py](backend/app/config.py) / [main.py](backend/app/main.py) |

---

## 13. Performance tuning cheat-sheet (env knobs)

| Goal | Knob(s) | Note |
| --- | --- | --- |
| Cut crowd-frame cost | `PER_PERSON_FACE_FALLBACK=false`, lower `INSIGHTFACE_DET_SIZE` (480/320) | Slight small-face recall loss |
| Speed up seated rooms | `TRACKLET_FAST_PATH=true`, tune `TRACKLET_REVERIFY_SECONDS/IOU` | Bounds mis-attribution window |
| Reduce idle CPU | `FRAME_DEDUP_ENABLED=true`, raise `FRAME_DEDUP_MAD_THRESHOLD` | Skips static frames |
| Lower inference resolution | `MAX_FRAME_LONG_SIDE` (e.g. 960) | Downscale before inference |
| Recall on filtered gallery | `HNSW_EF_SEARCH` (100; ≥ `IDENTITY_TOP_K`) | Fixes "re-registered as new" |
| Fewer duplicates | `GREY_ZONE_POLICY=review`, `REGISTRATION_POSE_POLICY=frontal` | Hold weak evidence |
| GPU | `DEVICE=cuda` + `onnxruntime-gpu` + CUDA torch | See ml_models device handling |
| Throughput (advanced) | `INFERENCE_WORKERS`, `INFERENCE_MAX_CONCURRENCY` | Only after per-worker models |

---

## 14. How to measure (before/after)

- **Per-frame timing:** DEBUG logs `process_frame timing: yolo=… arcface=…` and
  `Frame timing: inference=… post_db=…` ([cv_pipeline.py](backend/app/cv_pipeline.py), [camera_service.py](backend/app/services/camera_service.py)). Aggregate p50/p95.
- **Identity health:** query `detection_events` for new vs returning ratio and
  `grey_zone`/`ambiguous`/`pose_hold`/`tracklet_fast` counts; a good change *lowers*
  the new-visitor rate without raising false merges.
- **Dedup pressure:** number of pairs the nightly cross-camera reconcile proposes to merge.
- **DB:** pool checkout time, slow-query log on the HNSW resolve, `detection_events` size growth.
- **System:** CPU/GPU utilization, event-loop lag (should drop sharply after §2.1).

---

## 15. Hardware sizing (rule of thumb, CPU mode)

| Cameras @1 FPS | det_size | Suggested | Notes |
| --- | --- | --- | --- |
| 1–2 | 640 | 4 cores, 4 GB | Default config is fine |
| 3–6 | 480 | 8 cores, 8 GB | Enable tracklet fast-path + dedup |
| 6+ | 320–480 | GPU (CUDA) | CPU becomes the bottleneck; go GPU |

PostgreSQL: 2 GB is the compose limit; raise to 4 GB+ once `visitor_faces` and
`detection_events` grow, and ensure HNSW indexes fit in `shared_buffers`.

---

### Appendix — files referenced

- Pipeline: [cv_pipeline.py](backend/app/cv_pipeline.py), [ml_models.py](backend/app/ml_models.py), [camera_service.py](backend/app/services/camera_service.py)
- Identity: [identity_resolver.py](backend/app/services/identity_resolver.py), [detection_pipeline.py](backend/app/services/detection_pipeline.py), [auto_enroller.py](backend/app/services/auto_enroller.py)
- Core: [main.py](backend/app/main.py), [config.py](backend/app/config.py), [database.py](backend/app/database.py), [models.py](backend/app/models.py)
- Infra: [docker-compose.yml](docker-compose.yml), [.env.example](.env.example), [route.ts](dashboard/app/api/backend/[...path]/route.ts)
- Related plans: [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md), [ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md](ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md)
```
