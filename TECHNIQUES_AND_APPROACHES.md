# Restaurant Visitor Tracker — Techniques & Approaches

> Engineering reference for the computer-vision, identity-resolution, and
> data-management techniques used in the current system. This documents *how*
> and *why* each approach works, not the API surface. For deployment/ops see
> `RESTAURANT_TRACKER_PRODUCTION_DEPLOYMENT_PLAN.md`.

**Last updated:** 2026-06-17

---

## 1. System overview

The system auto-registers first-time visitors and recognises returning visitors
from camera footage, then tracks how long they stay and produces analytics — all
without any manual enrollment. It is a face-recognition pipeline hardened with
several layers of false-positive / false-negative control so that one person
does not fragment into many records and two people do not get fused into one.

```
 Camera / Upload
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  CV PIPELINE  (per frame)                                          │
│   YOLOv8n  ─►  ArcFace (all faces, 1 pass)  ─►  OSNet (bodies)      │
│   persons      512-d face embeddings            512-d re-ID         │
│        + head-pose estimate + mask heuristic + small-face rescue    │
└──────────────────────────────────────────────────────────────────┘
      │  DetectedPerson[]
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  IDENTITY RESOLUTION  (per face, batched DB round-trip)            │
│   pgvector HNSW search ─► threshold + ambiguity gate                │
│   ─► temporal-consistency gate ─► NEW / RETURNING / AMBIGUOUS       │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  ENROLLMENT / GALLERY MGMT      VISIT TRACKING        AUDIT          │
│  adaptive centroid + pose       in-mem state machine  detection_     │
│  gallery + thumbnail            (or Redis) + cooldown  events log     │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
   Analytics · Review Queue · Auto-tuning · Monitoring
```

### Models used

| Stage | Model | Output | Notes |
|-------|-------|--------|-------|
| Person detection | **YOLOv8n** (COCO class 0) | bounding boxes | ONNX on CPU (2-3× faster), native PyTorch on CUDA |
| Face detection + recognition | **InsightFace `buffalo_l` / ArcFace** | 512-d L2-normalized face embedding + 5-pt landmarks + det_score | Single full-frame pass detects *all* faces |
| Body re-ID | **OSNet x0.25** (MSMT17) | 512-d L2-normalized body embedding | Clothing-dependent — same-session only |

All three are loaded once into a process-wide singleton (`ModelManager`) on
startup, warmed up with dummy inference, and can be hot-swapped between CPU and
GPU at runtime without restarting.

---

## 2. Computer-vision pipeline (`cv_pipeline.py`, `ml_models.py`)

### 2.1 Single-pass, full-frame face detection
Rather than cropping each YOLO person box and running ArcFace per crop, the
pipeline runs **one ArcFace pass over the whole frame** (`extract_all_faces`) and
then *assigns* each detected face to the person box whose interior contains the
face centre (highest det_score wins, each face used at most once). This is far
cheaper than N per-person passes and also catches **face-only detections** —
e.g. a seated patron whose body is occluded by a table — which are emitted as
standalone detections even when they fall outside every person box.

### 2.2 Small-face rescue
A face that fails the quality gate (`MIN_FACE_DET_SCORE` / `MIN_FACE_SIZE_PX`)
isn't dropped immediately. `refine_small_face` crops it with 50% margin,
upscales so the face is ~160px, and re-runs ArcFace. Only if it still fails is it
discarded. A separate per-person fallback re-runs ArcFace on the upscaled person
crop when no full-frame face landed in that box.

### 2.3 Geometric head-pose estimation (`estimate_pose`)
Head pose is derived **purely from the 5-point InsightFace landmarks** (eyes,
nose, mouth corners) — no extra model:
- **Yaw** from nose horizontal offset vs. eye-centre, normalized by inter-ocular
  distance (IOD).
- **Pitch** from nose vertical position vs. eye-mouth midpoint.
- **Roll** from the eye-line angle.

Each face is binned into `frontal` / `left` / `right` / `down` / `unknown`. These
**pose bins** drive both the pose-aware gallery and pose-aware gallery search.

### 2.4 Mask detection — periocular heuristic (`mask_detector.py`)
A model-free heuristic flags masks: the **lower 40%** of the face crop is flat
(low std-dev = solid mask) while the **upper 40%** retains texture (real eyes).
Works for both dark cloth and white surgical masks. When masked, the returning
threshold is loosened by `MASKED_FACE_THRESHOLD_OFFSET` (−0.05) and a periocular
(eye-region) crop can be used for embedding extraction.

### 2.5 Face preprocessing — CLAHE + auto-gamma (`utils.py`)
Before recognition, crops are normalized for restaurant lighting:
- **Auto-gamma** based on mean luminance — brightens dark / backlit faces,
  slightly darkens overexposed ones (clamped to γ∈[0.5, 2.0]).
- **CLAHE** (Contrast-Limited Adaptive Histogram Equalisation) on the L channel
  of LAB colour space (~2 ms per 112×112 crop).

The *original* crop is kept for the thumbnail so stored photos look natural.

### 2.6 Group-frame detection
`_is_group_frame` flags crowded frames (≥3 person boxes with significant pairwise
IoU overlap) so downstream logic can be more conservative about creating new
identities in scenes where occlusion is likely.

---

## 3. Performance & throughput techniques

### 3.1 Embedding cache (dHash) — `FaceEmbeddingCache`
A per-stream cache keyed by a **difference-hash (dHash)** of the *aligned* face
crop. A face that is pixel-stable across consecutive frames is embedded by
ArcFace once and reused at zero inference cost. Exact-hash matching is safe: a
collision requires two visually identical aligned crops, which would embed
identically anyway.

### 3.2 Frame de-duplication
A 32×32 grayscale thumbnail signature of each frame is compared (mean absolute
difference) against the previous one. If the scene is near-static
(`FRAME_DEDUP_MAD_THRESHOLD`), the entire heavy YOLO+ArcFace+OSNet pass is
skipped — ~1 ms compare vs. ~1 s detection. In ROI mode, dedup runs only on the
zone so only motion *inside* the zone triggers a detection pass.

### 3.3 Cascade pipeline — skip body when face is strong (`cascade_pipeline.py`)
Two-pass strategy: run face detection first (no OSNet), then run OSNet **only**
for persons whose `face_det_score < FACE_CONF_SKIP_BODY` (0.60) or who have no
face. Saves ~30-40% CPU because the re-ID model is invoked only when the face
signal is weak.

### 3.4 ONNX YOLO on CPU
On CPU, YOLO is exported once to ONNX (cached next to the `.pt`) and run via
onnxruntime — typically 2-3× faster. On CUDA the native PyTorch model is used.

### 3.5 Batched inference
- OSNet runs **one batched forward pass** for all queued person crops per frame.
- Identity resolution does **one DB round-trip** for all faces in a frame (see
  §4.1).

### 3.6 Parallel streaming pipeline (`camera_service.py`)
The camera runs as a **multi-stage concurrent pipeline** (default):
- **Capture loop** — grabs frames, keeps only the newest (drops backlog →
  low-latency live view), paces video files to their native FPS.
- **Inference worker(s)** — claim the latest frame (newest-wins, skipping
  intermediate frames), run the CV pipeline off the event loop.
- **Consumer loop** — ROI filter + DB writes + publishes detection overlays.
- **Display loop** — encodes JPEG at a steady `LIVE_PREVIEW_FPS` independent of
  detection, so the live feed never freezes when detection is skipped.

This keeps the GPU busy on inference while the CPU handles capture, DB writes and
JPEG encoding in parallel. A sequential single-loop mode is available as a
fallback (`PIPELINE_PARALLEL=False`).

### 3.7 Inference concurrency gate
A global semaphore (`INFERENCE_MAX_CONCURRENCY`) serializes/bounds heavy
inference across all requests and tasks, because each inference call already
saturates every CPU core — running several concurrently would only thrash. CPU
thread counts for OMP/MKL/OpenBLAS are pinned at import time in `main.py`.

### 3.8 Region of Interest (ROI)
When an ROI is set, **all heavy compute runs on the zone crop only** — YOLO,
ArcFace, and OSNet never process (and nothing registers) for anyone outside it.
Boxes are offset back to full-frame coordinates afterwards. A dimmed overlay
with an amber border visualises the active zone on the live feed.

---

## 4. Identity resolution (`identity_resolver.py`)

The core decision per detected face: **NEW**, **RETURNING**, or **AMBIGUOUS**.

### 4.1 Batched pgvector HNSW search
All faces in a frame are searched in a **single DB round-trip** using
`VALUES ... CROSS JOIN LATERAL`, returning the top-2 gallery matches per face.
The gallery (`visitor_faces.embedding`) is indexed with an **HNSW** index
(`vector_cosine_ops`, m=16, ef_construction=64) for fast approximate nearest
neighbour. Cosine similarity = `1 - (embedding <=> query)`.

Opted-out and inactive visitors are excluded directly in SQL.

### 4.2 Pose-aware gallery search
When pose bins are supplied, each face is compared against its **matching pose
bin first**, then `frontal` as fallback, then `unknown` — ranked by a `CASE`
ordering. A right-profile query preferentially matches stored right-profile faces
of the same person, improving recall across head angles.

### 4.3 Threshold + ambiguity gate (`_decide_from_face`)
| Condition | Decision |
|-----------|----------|
| `top_sim ≥ RETURNING_FACE_THRESHOLD` and clears runner-up by `AMBIGUITY_MARGIN` | **RETURNING** |
| top_sim ≥ threshold but runner-up within `AMBIGUITY_MARGIN` | **AMBIGUOUS** — skip (don't risk a false merge) |
| `top_sim ≤ NEW_VISITOR_MAX_SIMILARITY` (and quality OK) | **NEW** |
| grey zone (between the two) | body fallback, else NEW only if quality clears `FACE_QUALITY_CUTOFF`, else dropped |

The **ambiguity gate** is the key anti-merge defence: if two different known
visitors explain a face almost equally well, the detection is recorded as
ambiguous and not attributed to anyone.

Default thresholds (buffalo_l ArcFace): `RETURNING_FACE_THRESHOLD=0.55`,
`NEW_VISITOR_MAX_SIMILARITY=0.45`, `AMBIGUITY_MARGIN=0.05`,
`STRONG_MATCH_THRESHOLD=0.65`. **These must be recalibrated on real camera
footage.**

### 4.4 Body fallback (opt-in, same-session only)
OSNet body embeddings are **clothing/appearance dependent** — they discriminate
"same person, same outfit, minutes apart", NOT a regular customer on a different
day. Body matching is therefore **OFF by default** (`ALLOW_BODY_FALLBACK`) and,
when enabled, only used for grey-zone same-session re-acquisition.

### 4.5 Temporal-consistency gate (`temporal_consistency.py`)
Before a NEW visitor is created, the temporal gate checks a sliding window of
recent confirmed detections. If a "new" face appears within
`TEMPORAL_WINDOW_SECONDS` (30s) and `TEMPORAL_MAX_PIXEL_DISTANCE` (150px) of a
recently-seen known visitor, with cosine similarity ≥ `TEMPORAL_MIN_SIMILARITY`,
it is treated as that visitor **re-appearing** (e.g. they turned their head)
rather than a new registration. The match score blends similarity (0.7) and
spatial proximity (0.3). This prevents same-person fragmentation between frames.

---

## 5. Auto-enrollment & gallery management (`auto_enroller.py`)

### 5.1 Dual representation: centroid + multi-pose gallery
Each visitor has:
- a **centroid** embedding on the `visitors` row (one vector, adaptively updated)
  used as a quick summary, and
- a **gallery** of up to `MAX_FACES_PER_VISITOR` (10) individual face embeddings
  in `visitor_faces`, used for the actual HNSW search.

### 5.2 Adaptive centroid (weighted moving average)
On a confident returning match, the centroid is nudged toward the new embedding:
```
alpha = CENTROID_ALPHA_BASE · min(det_score·2, 1) · max(0.05, 1/(1 + visit_count·0.1))
centroid = (1-alpha)·centroid + alpha·new_embedding   (then re-normalized)
```
The learning rate **shrinks as visit_count grows** (an established identity is
trusted more) and **scales with detection quality** (blurry detections move it
less).

### 5.3 Pose-aware gallery with smart eviction
The gallery enforces diversity across pose bins (target 2-4 faces per bin):
- **Room available** → add if the bin isn't over its cap (`_MAX_PER_BIN`).
- **Gallery full, this bin underrepresented** → evict the lowest-quality face
  from the most over-represented bin (so frontals don't crowd out profiles).
- **Gallery full, bin has enough** → only replace the worst face *in the same
  bin*, and only if the newcomer scores higher.

### 5.4 Diversity check (anti near-duplicate)
On medium-confidence matches, a face is only added if it is **not a near-
duplicate** of an existing gallery face (cosine < 0.85). High-confidence matches
(≥ `STRONG_MATCH_THRESHOLD`) are always added and also update the centroid.

### 5.5 Quality-weighted centroid recompute
After a merge or gallery edit, `recompute_centroid_from_gallery` rebuilds the
centroid as a **det_score-weighted average** of all current gallery faces (rather
than relying on the stale adaptive average), and refreshes the body centroid as
the mean of gallery body embeddings.

### 5.6 Thumbnail management
The best (highest det_score) face crop seen so far is saved as the visitor
thumbnail and upgraded whenever a clearer face is detected.

### 5.7 Clarity-based gallery cleaning (`face_quality.py`)
Operator-triggered "auto-clean faces" scores every gallery face on a model-free
**clarity** metric and prunes the unclear ones (always keeping the single
clearest):
```
clarity = 0.40·frontality + 0.35·sharpness + 0.25·det_score   (with crop)
        = 0.60·frontality + 0.40·det_score                     (no crop)
```
- **frontality** — from the pose bin (frontal=1.0, profile/down penalized).
- **sharpness** — Laplacian variance normalized by `FACE_BLUR_REF`.
- **det_score** — InsightFace detection confidence.

---

## 6. Visit-session tracking (`visit_tracker.py`, `redis_visit_tracker.py`)

A **state machine** decides when a stream of detections is one visit vs. a new
one:
- A visit stays open while detections keep arriving.
- After `VISIT_COOLDOWN_MINUTES` (20) of no detection, the visit is closed; the
  next detection of that visitor opens a **new** visit and increments
  `visit_count`. A short absence (bathroom break) stays the same visit.
- **Seated heuristic** — a person in the lower 60% of the frame with bbox
  height < 40% is inferred "seated" and gets a longer `SEATED_COOLDOWN_MINUTES`
  (45), since seated patrons are detected less frequently.
- **Max-duration cap** (`MAX_VISIT_DURATION_HOURS`, 4) force-closes runaway
  visits.

Cooldown is enforced **at detection time** (not only by the cleanup task) so a
return after the cooldown always counts as a new visit regardless of cleanup
cadence. A background loop (`STALE_CHECK_INTERVAL_SECONDS`) closes idle visits,
and **active visits are recovered from the DB on startup** so a restart never
loses an open session.

### Single-worker vs. Redis
The default in-memory tracker requires a **single worker process**. For
multi-worker / multi-camera scale-out, `RedisVisitTracker` mirrors the same API
with active-visit state in Redis, using **per-visitor distributed locks**
(`SET NX EX 5`) so concurrent workers don't double-open visits.

---

## 7. Self-healing & data-quality systems

### 7.1 Human review queue (`review_queue.py`)
Auto-flags suspicious events for operator review rather than letting errors
compound:
- `new_low_quality` — new visitor registered with det_score below threshold.
- `probable_duplicate` — a new visitor's best similarity sits just below the
  new-visitor threshold (records *which* visitor it resembled and how closely).
- `high_ambiguity` — a visitor's ambiguous-match rate exceeds 20%.
- `opted_out_match` — a detection matched a now-opted-out visitor.

### 7.2 Visitor merge (`visitor_merge.py`)
Folds one visitor into another: re-points all `visits` / `visitor_faces` /
`detection_events`, recomputes target aggregates, rebuilds the centroid from the
pooled gallery, evicts the source from the live tracker, and deletes the source.
Shared by the manual admin merge and the auto-dedup sweep so both behave
identically.

### 7.3 One-click auto-merge dedup
`auto_merge_duplicates` merges every unresolved `probable_duplicate` whose
recorded similarity ≥ `AUTO_MERGE_MIN_SIMILARITY` (0.65, highest-confidence
first) into the visitor it resembles. The **confident floor matters** —
mass-merging weak (~0.40) pairs could fuse two different people, so weaker pairs
are left for human review.

### 7.4 Auto-tuning (`auto_tuning.py`)
A weekly background job adjusts `RETURNING_FACE_THRESHOLD` based on the observed
**false-new rate** (= low-confidence new registrations / total detections over
the interval):
- false-new > 5% → threshold too low → **raise** by 0.02.
- false-new < 1% → probably too strict → **lower** by 0.01.
- Clamped to [0.45, 0.75]; needs ≥100 detections; every change is logged to
  `auto_tuning_log`.

### 7.5 Health monitoring (`monitoring.py`)
A background loop (`HEALTH_CHECK_INTERVAL_SECONDS`) checks DB connectivity, model
availability, and a sliding-window **p95 frame latency**. Failures (DB down,
models unavailable, p95 > 5s) fire a webhook alert, rate-limited to once per
10-minute cooldown per alert type.

---

## 8. Analytics (`analytics_service.py`)

All analytics **exclude staff and soft-deleted visitors**. Key techniques:
- **Summary / by-day / hourly / frequency / top-visitors** built directly in SQL.
- **New vs. returning** determined per-visit via a `NOT EXISTS` check for any
  earlier visit by the same visitor.
- **Confidence-weighted counts** — each visitor contributes their *max*
  face_similarity rather than a flat 1, so the `effective_unique` head count
  discounts low-confidence (possibly false) registrations and is always ≤ the raw
  unique count.
- **Detection-quality bands** — high (≥0.65) / medium (0.45-0.65) / low — to
  surface systematic recognition issues.

---

## 9. Data model (`models.py`) & schema evolution

| Table | Purpose | Key features |
|-------|---------|--------------|
| `visitors` | Core identity | centroid `face_embedding`/`body_embedding` (`Vector(512)`), denormalized visit stats, consent fields, HNSW indexes on both vectors |
| `visitor_faces` | Multi-pose gallery | per-face embedding + det_score + `pose_bin` + `clarity_score` + crop path, HNSW index |
| `visits` | Visit sessions | enter/leave/duration, **partial index** on `left_at IS NULL` for fast active-visit lookup |
| `detection_events` | Per-detection audit trail | similarity, match_source, bbox (JSONB); **partitioned** (migration 004) |

Embeddings are stored via **pgvector** with **HNSW** cosine indexes
(m=16, ef_construction=64). Cascade deletes clean up child rows when a visitor is
removed. Migrations (Alembic 001-009) progressively add: pose bins & consent,
the consent system, detection-event partitioning, runtime settings, the review
queue, auto-tuning log, review-queue match metadata, and face-crop clarity.

---

## 10. Privacy, consent & retention

Auto-enrolling biometric data of patrons may be regulated (GDPR / BIPA). The
system includes:
- **Consent status** per visitor (`implicit` / `explicit` / `opted_out`) with
  timestamps and method; opted-out visitors are excluded from all gallery search.
- **Physical-notice** text + optional QR URL configuration.
- **Retention purge** — a background loop deletes visitors whose `last_seen_at`
  exceeds `VISITOR_RETENTION_DAYS` (0 = disabled), cascade-removing their data.
- **Opted-out embedding TTL** — short retention window for opted-out embeddings.

---

## 11. Runtime configuration & hot-swapping

- **Live setting patches** (`/api/admin/settings`) — a whitelisted set of
  thresholds can be changed in-process without a restart, persisted to a
  `runtime_settings` table and re-applied on startup.
- **Live device switch** (`/api/admin/device`) — swap CPU↔GPU at runtime; all
  models are torn down and reloaded onto the new device while inference is paused
  (held behind the inference semaphore). The choice is persisted and honoured on
  the next startup.

---

## 12. Key tunable parameters (quick reference)

| Setting | Default | Controls |
|---------|---------|----------|
| `RETURNING_FACE_THRESHOLD` | 0.55 | Min similarity to recognise a returning visitor (auto-tuned) |
| `NEW_VISITOR_MAX_SIMILARITY` | 0.45 | Below this → definitely NEW |
| `AMBIGUITY_MARGIN` | 0.05 | Min top-2 gap to avoid AMBIGUOUS |
| `STRONG_MATCH_THRESHOLD` | 0.65 | Confident match → centroid update + gallery add |
| `FACE_QUALITY_CUTOFF` | 0.45 | Min det_score to seed/grow gallery |
| `MAX_FACES_PER_VISITOR` | 10 | Gallery size cap |
| `VISIT_COOLDOWN_MINUTES` / `SEATED_COOLDOWN_MINUTES` | 20 / 45 | Visit session gap |
| `TEMPORAL_WINDOW_SECONDS` / `_MAX_PIXEL_DISTANCE` / `_MIN_SIMILARITY` | 30 / 150 / 0.50 | Same-person re-acquisition gate |
| `FACE_CONF_SKIP_BODY` | 0.60 | Cascade: skip OSNet above this face score |
| `FRAME_DEDUP_MAD_THRESHOLD` | 4.0 | Static-scene skip sensitivity |
| `ALLOW_BODY_FALLBACK` | False | Enable clothing-based body re-ID (same-session only) |

---

## 13. Design principles distilled

1. **Bias toward NOT creating identities in the grey zone** — fragmenting one
   person into many records is the common failure mode; the ambiguity gate,
   conservative new-visitor threshold, and temporal gate all defend against it.
2. **Never fuse two people** — the auto-merge confidence floor and ambiguity
   skip exist precisely to avoid corrupting a gallery with a wrong merge.
3. **Self-improve on confident matches only** — galleries and centroids grow
   from high-quality, high-confidence detections; everything else is logged but
   not trusted.
4. **Cheap signals first** — dHash cache, frame dedup, cascade body-skip, and
   ONNX all avoid expensive inference whenever a cheaper test suffices.
5. **Degrade gracefully** — missing OSNet → face-only; missing GPU → CPU;
   missing Redis → in-process; missing tables → skip silently.
6. **Human-in-the-loop for the hard cases** — the review queue surfaces
   uncertain decisions instead of silently guessing.
```
