# Restaurant Visitor Tracker — Optimization & Accuracy Plan

> This document is a working plan extracted from a full read-through of the current
> codebase (`backend/app/**/*.py`) and `TECHNIQUES_AND_APPROACHES.md`. It lists the
> duplicate/redundant code found, the accuracy problems that cause one person to be
> registered multiple times (especially across camera angles), and a staged roadmap
> for the best optimization and accuracy improvements.
>
> **Scope:** accuracy, throughput, multi-camera behaviour, code maintainability.  
> **Out of scope:** deployment/operations (see `RESTAURANT_TRACKER_PRODUCTION_DEPLOYMENT_PLAN.md`).

**Last updated:** 2026-06-17

---

## 1. Executive summary

The current pipeline is already well engineered: single-pass ArcFace, pose-aware
HNSW search, a temporal gate, ambiguity-margin protection, cascade body skip, and
frame de-duplication. However, several recurring failure modes remain:

1. **Same person, different camera angle → new registration.** The pose bins are
   coarse (frontal / left / right / down) and the thresholds are global constants.
   A profile view can fall below `RETURNING_FACE_THRESHOLD` and create a duplicate.
2. **Gallery growth is greedy.** New faces are added on every confident match
   without verifying that they actually improve cross-angle recall or reduce
   duplicates.
3. **No cross-camera identity linking.** Each camera resolves identities
   independently; there is no reconciliation layer to fuse visitors seen by
   different cameras.
4. **Single-frame decision making.** A visitor can be registered from one bad
   frame even though surrounding frames clearly show the same person.
5. **Redundant bbox/crop/frame logic is duplicated across modules**, which makes
   threshold and preprocessing changes error-prone.

This plan is organized as:

- **Part 2** — Code-level duplication & redundancy audit.
- **Part 3** — Accuracy diagnosis (why duplicates happen).
- **Part 4** — Best optimization opportunities.
- **Part 5** — Multi-camera / cross-angle accuracy roadmap.
- **Part 6** — Recommended implementation phases.
- **Part 7** — Validation & metrics to watch.

---

## 2. Duplicate code & redundancy audit

### 2.1 Mask detection — duplicated lower-face extraction

| Location | Lines | Issue |
|----------|-------|-------|
| `services/mask_detector.py` | 17–23, 59–63 | `_lower_face_brightness()` and `_lower_std()` both crop the lower 40% of the face and convert to gray. The crop + gray logic should be shared. |
| `services/mask_detector.py` | 25–30, 66–80 | `_upper_face_uniformity()` and `extract_periocular_region()` also repeat crop/resize patterns already present in `cv_pipeline.py` and `utils.py`. |

**Recommendation:** Introduce `_crop_region(face_crop, y0_frac, y1_frac, to_gray=False)`.

### 2.2 Bounding-box manipulation repeated in many files

| Function | File | Duplicated concern |
|----------|------|--------------------|
| `_crop()` | `services/detection_pipeline.py` | Clamps bbox to frame bounds. |
| `_roi_crop()` / `_offset_detections()` | `services/camera_service.py` | Clamps + offsets boxes. |
| `process_frame()` persons loop | `cv_pipeline.py` | Clamps person boxes, validates min size. |
| `process_frame_cascade()` body pass | `services/cascade_pipeline.py` | Clamps boxes again to extract crops. |
| `_extract_video_frames_from_path()` | `utils.py` | Calls `cap_frame_long_side()`. |

**Current state:** Every consumer that needs a crop re-implements clamping, min-size
validation, and coordinate offsetting.

**Recommendation:** Create a single `geometry.py` module with:

```python
clamp_box(box, frame_shape)
box_area(box)
box_iou(a, b)
box_center(box)
crop_from_frame(frame, box, margin=0.0, min_size=4)
scale_box(box, scale, origin=(0, 0))
```

Refactor all five call-sites to use it.

### 2.3 Frame de-duplication implemented twice

| File | Function | Context |
|------|----------|---------|
| `services/camera_service.py` | `_inference_worker()` and `_processing_loop()` | Computes `frame_signature()` + `frames_are_similar()`. |
| `api/detect.py` | `detect()` | Same logic for uploaded videos. |

**Recommendation:** Wrap de-duplication into `FrameDedupBuffer` (stateful) and
`VideoDedupBuffer` (per-upload). That object owns the previous signature and the
threshold.

### 2.4 Face crop saving logic is nearly identical

| File | Functions |
|------|-----------|
| `services/auto_enroller.py` | `_save_thumbnail()` and `_save_face_crop()` |

Both create a directory, build a path, and `cv2.imwrite()`. The only difference is
filename and sub-folder.

**Recommendation:** Single helper `save_image_to_visitor_dir(visitor_id, rel_path, image)`.

### 2.5 Cosine similarity computed in two places

| File | Usage |
|------|-------|
| `services/identity_resolver.py` | Uses `1 - (embedding <=> query)` via pgvector in SQL. |
| `services/temporal_consistency.py` | Uses NumPy `dot / norms`. |
| `services/auto_enroller.py` `_is_diverse_embedding()` | Uses NumPy `dot` (assumes normalized). |

**Recommendation:** Expose `cosine_similarity(a, b, assume_normalized=False)` in
`utils.py` and use it for in-memory comparisons. Keep SQL distance for DB search,
but document that the two must match.

### 2.6 Two very similar resolve-flag functions

| File | Function |
|------|----------|
| `services/review_queue.py` | `resolve_flag()` |
| `api/admin.py` (likely) | `resolve_review_flag()` (referenced in graph report) |

The graph report shows duplicated "Mark a review flag as resolved" nodes. Both
should be consolidated behind the service-layer function.

### 2.7 Face embedding normalization scattered

- `ml_models.py` normalizes inside `_extract_all_faces_cached()`.
- `ml_models.py` normalizes OSNet outputs in `extract_body_embeddings()`.
- `cv_pipeline.py` normalizes again via `normalize_embedding()`.
- `utils.py` defines `normalize_embedding()`.

**Recommendation:** Make `ModelManager` return **already normalized** embeddings
for both face and body, and remove redundant normalization in callers. Keep
`normalize_embedding()` as a public utility for tests/external callers only.

### 2.8 In-memory vs Redis visit tracker split

Two classes (`VisitTracker` and `RedisVisitTracker`) maintain overlapping state
machines. If multi-worker support is required, the cleaner path is:

- Implement an abstract `VisitTrackerBackend`.
- Provide `InMemoryBackend` and `RedisBackend`.
- Keep the state-machine logic in one place.

---

## 3. Accuracy diagnosis — why same people become multiple visitors

### 3.1 Pose-bin granularity is too coarse

Current bins: `frontal` (−15°..+15°), `left` (<−15°), `right` (>+15°), `down`, `unknown`.

**Problem:** A face at +30° yaw and +75° yaw are both `right`, but ArcFace
embeddings differ significantly across that range. The pose-aware search
preferentially matches the same bin, but it does not interpolate confidence by
actual yaw/pitch. A 75° profile may score 0.40 against the stored 30° profile and
be registered as a new visitor.

**Root cause:** The system only stores the bin label, not the continuous yaw/pitch
values, and thresholds are global constants.

### 3.2 Thresholds are one-size-fits-all

| Threshold | Current behavior |
|-----------|------------------|
| `RETURNING_FACE_THRESHOLD` | Global constant (0.55), auto-tuned weekly by false-new rate. |
| `NEW_VISITOR_MAX_SIMILARITY` | Global constant (0.45). |
| `AMBIGUITY_MARGIN` | Global constant (0.05). |

**Problem:** Some visitors have compact, stable embeddings (frontal-only, good
lighting) and can safely match at 0.55. Others have high within-person variance
(mixed angles, masks, backlight) and need a lower threshold. A single threshold
inevitably fragments or fuses people.

### 3.3 Gallery seeds from the first detection only

`register_new_visitor()` creates the visitor using the very first face seen. If
that first face is a bad angle or partial occlusion, the centroid is biased, and
future matches start from a weak reference point.

### 3.4 No temporal smoothing before registration

Every frame makes an independent NEW / RETURNING / AMBIGUOUS decision. A single
weak frame can create a brand-new visitor record even if the previous frame
correctly matched the person.

### 3.5 Cross-camera identity is completely independent

There is no reconciliation layer:

- Each `camera_id` writes its own `DetectionEvent` rows.
- `VisitTracker` tracks one active visit per visitor globally, but identity
  resolution happens per camera.
- A person walking from Camera-1 to Camera-2 will be registered twice unless the
  second camera happens to see a very similar pose.

### 3.6 Body fallback is disabled and session-scoped

`ALLOW_BODY_FALLBACK=False` by default; even when enabled, body embeddings are
clothing dependent and only help within the same visit. They do not help for
multi-camera re-identification across minutes or hours.

### 3.7 Ambiguity gate can over-suppress correct matches

If two different gallery faces of the **same person** happen to score similarly
(e.g. a stored frontal and a stored profile both ~0.52), the ambiguity margin may
mark the detection as AMBIGUOUS. This is better than a false merge, but it also
prevents the system from learning the new angle.

### 3.8 Masked-face handling is heuristic-only

`is_masked()` uses std-dev thresholds and only adjusts the returning threshold.
It does **not** re-embed from the periocular region in the current code path:
`detection_pipeline.py` calls `_is_masked()` but never calls
`extract_periocular_region()`. Masked-face accuracy therefore relies entirely on
the threshold offset.

---

## 4. Best optimization opportunities

### 4.1 Replace single-frame decisions with tracklet-level identity

Instead of resolving each frame independently, maintain short **tracklets**
(2–5 seconds of detections for one face trajectory) and resolve the whole
tracklet before creating/updating a visitor.

**Benefits:**
- One bad frame cannot create a duplicate visitor.
- Multiple angles within the tracklet can be fused into one embedding.
- Confusion between two people in the same frame is easier to resolve.

**Implementation sketch:**

```text
Frame N-1      Frame N        Frame N+1
   │              │              │
   └──────┬───────┘              │
          ▼                        │
   Tracklet: {bbox trajectory, face embeddings, poses}
          │
          ▼
   Aggregate embedding (weighted mean / quality-weighted)
          │
          ▼
   Resolve once → visitor_id
```

### 4.2 Use a better face-recognition backbone

Current: InsightFace `buffalo_l` / ArcFace (512-d).

Consider upgrading to:

| Model | Why |
|-------|-----|
| **AdaFace** | Better performance across pose/age/quality variations; designed for low-quality faces. |
| **MagFace** | Learns a magnitude that correlates with face quality; naturally down-weights poor crops. |
| **CurricularFace / ArcFace-R** | Stronger discriminative training for large galleries. |
| **Eva02 or SwinFace ( ONNX )** | Higher accuracy for masked/partial faces but slower. |

**Recommended path:** Keep `buffalo_l` as the default, add a setting
`FACE_MODEL_NAME` and a model adapter so AdaFace/MagFace can be evaluated without
rewriting the resolver.

### 4.3 Per-visitor adaptive thresholds

Compute a personal similarity distribution for each visitor from their gallery:

```python
visitor.expected_match_sim = mean(gallery pairwise similarities)
visitor.match_std = std(gallery pairwise similarities)
```

Then use:

```python
personal_threshold = max(0.40, min(0.70,
    visitor.expected_match_sim - 2 * visitor.match_std))
```

Visitors with high within-person variance get a lower returning threshold,
visitors with very consistent frontal-only embeddings stay strict. This directly
addresses the multi-angle fragmentation problem.

### 4.4 Learned quality-aware embedding fusion

Instead of averaging gallery embeddings for the centroid, train or calibrate a
fusion function that weights embeddings by:

- pose confidence / frontality
- sharpness (`face_quality.py` already computes this)
- det_score
- whether the embedding improved pairwise recall on recent detections

This can be as simple as a weighted average with learned weights, or a small MLP
if enough labelled pairs are available.

### 4.3 Optimize inference

| Area | Current | Better |
|------|---------|--------|
| YOLO export | ONNX for CPU, PyTorch native for GPU | TensorRT for GPU, OpenVINO for CPU; keeps ONNX as fallback. |
| ArcFace | InsightFace `get()` or manual det+rec | Export recognition model to ONNX/TensorRT; batch multiple faces. |
| OSNet | PyTorch on CPU/GPU | ONNX/OpenVINO; 256×128 input is large for person crops — consider 128×64 when faces are strong. |
| Frame resize | Always to 1280 long side | Dynamically choose based on expected face size; far cameras need more resolution. |

### 4.4 Batch across frames, not just within a frame

The current batching is within one frame (OSNet + resolver). A higher-throughput
mode could:

1. Buffer 2–3 frames.
2. Run YOLO on all at once, or at least amortize the ArcFace cache look-up.
3. Use the tracklet buffer to merge faces across frames before DB search.

### 4.5 Cache pre-filtering with visitor centroid

Current: every face searches `visitor_faces` (up to N×10 rows per visitor).

Better:

1. First compare the query to every visitor's **centroid** in `visitors.face_embedding`.
2. Keep only candidates within a loose radius (e.g. 0.40).
3. Then run HNSW on `visitor_faces` for those candidates.

This is cheaper and reduces the chance of matching a difficult face against an
irrelevant visitor.

### 4.6 Use ANN quantization for large galleries

When the gallery grows beyond ~50k faces, pure HNSW can become memory-heavy.
Add support for:

- `pgvector` `ivfflat` / `ivfpq` indexes.
- Disk-based Faiss indexes for offline dedup sweeps.

### 4.7 Reduce DB round-trips

Current per-frame path:

1. `resolve_batch()` — 1 DB query for all faces.
2. For each new visitor — `register_new_visitor()` + flush + insert.
3. For each returning visitor — `db.get(Visitor)` + centroid update + gallery insert.
4. `tracker.process_detection()` — UPDATE `Visit`, UPDATE `Visitor`.
5. `DetectionEvent` insert.
6. `db.commit()`.

Optimizations:

- Bulk insert `DetectionEvent` rows at the end of each frame rather than one-by-one.
- Cache recently seen `Visitor` objects in memory with TTL (Redis or small LRU).
- Batch event writes to a queue and flush every N frames or M seconds.

---

## 5. Multi-camera / cross-angle accuracy roadmap

### 5.1 Near-term fixes (0–2 weeks)

#### 5.1.1 Persist continuous pose values

Add `yaw`, `pitch`, `roll` to `visitor_faces` (float columns) and use them at
match time to weight similarity by angular distance:

```sql
ORDER BY
  CASE
    WHEN ABS(vf.yaw - :yaw) < 15 THEN 1
    WHEN ABS(vf.yaw - :yaw) < 35 THEN 2
    ELSE 3
  END,
  vf.embedding <=> :emb
```

This is much finer-grained than the current bin-based ordering.

#### 5.1.2 Implement per-visitor adaptive threshold

Add columns to `visitors`:

```sql
expected_match_similarity float,
match_similarity_std      float,
personal_threshold        float,
```

Compute them after each new gallery face is added (using pairwise cosine
similarities within the gallery). Use `personal_threshold` in the resolver when
it differs significantly from the global threshold.

#### 5.1.3 Temporal tracklet before registration

Replace the single-frame new-visitor decision with a 2-second buffer. A new
visitor is only created if **multiple detections in the tracklet** all fail to
match any gallery candidate. This prevents one bad angle from fragmenting an
identity.

#### 5.1.4 Actually use periocular embedding for masks

In `detection_pipeline.py`, when `_is_masked()` is true, call
`extract_periocular_region()` and re-run `ModelManager.extract_face_data()` on
that crop. Use the masked threshold offset on the periocular embedding.

### 5.2 Medium-term features (2–8 weeks)

#### 5.2.1 Cross-camera visitor reconciliation

Add a background job that compares recent visitors across cameras:

```text
For each visitor seen on camera A in last T minutes:
  Search centroid/gallery against all visitors seen on camera B in last T minutes
  If top match similarity >= CROSS_CAMERA_MERGE_THRESHOLD (e.g. 0.60):
     Queue for operator confirmation OR auto-merge if >= AUTO_MERGE_MIN_SIMILARITY
```

Store a `camera_aliases` mapping so staff can name physical camera locations,
which helps validate cross-camera merges.

#### 5.2.2 Spatio-temporal constraints

A person cannot be seen by Camera-A and Camera-B at the same time if the cameras
are far apart. Use this to **disallow** matches that violate travel time:

```python
if camera_a != camera_b and time_delta < min_walk_time(a, b):
    candidate_score *= 0.5   # penalize impossible transitions
```

Requires a simple `camera_locations` table with pairwise transition times.

#### 5.2.3 Body+clothing re-ID across short gaps

Enable a cross-camera body pipeline that is explicitly **not** face-based:

- Extract OSNet body embedding.
- Store dominant upper-body / lower-body colours from the person crop.
- When face similarity is weak but time/location permit, fuse face + body +
  colour similarity.

This should be a separate `cross_camera_score` used only for reconciliation, not
for visit tracking (so clothing changes don't corrupt analytics).

#### 5.2.4 Gallery quality scoring on insert

Before adding a new gallery face, check whether it actually improves the
visitor's gallery:

1. Compute pairwise similarities of proposed gallery.
2. Reject the new face if it is a near-duplicate (cosine ≥ 0.92) or if it lowers
the mean pairwise similarity of the gallery.
3. Prefer adding a new face only when it increases angular coverage (different
yaw/pitch bin).

This keeps galleries small, diverse, and high-quality.

### 5.3 Long-term research (2–6 months)

#### 5.3.1 3D face normalization

Use a lightweight 3D face model (e.g. `3DDFA_V2`, `SynergyNet`, or
`InsightFace`'s dense landmarks) to frontalize profile faces before embedding.
This dramatically reduces embedding variance across angles.

#### 5.3.2 End-to-end tracking (SORT / ByteTrack / DeepSORT)

Replace the per-frame identity resolution with a real multi-object tracker:

- Kalman filter for bbox motion.
- Appearance feature (face/body embedding) for re-ID.
- Track IDs are stable across frames; only one identity decision per track.

This also solves the "same person turns head and becomes new visitor" problem
because the track survives the head turn.

#### 5.3.3 Self-supervised gallery refinement

Periodically re-evaluate the gallery against the visitor's own recent detection
history:

- Remove gallery faces that rarely or never re-match.
- Add synthetic augmentations (brightness, small rotations) to existing gallery
  faces and keep only those that improve recall.
- Use clustering (DBSCAN on gallery embeddings) to detect if one visitor record
  has actually captured two people.

---

## 6. Staged implementation plan

### Phase 1 — Foundation & quick wins (Week 1–2)

1. **Refactor duplicated helpers**
   - Create `geometry.py` and migrate bbox cropping/IOU/center/offset logic.
   - Consolidate mask-detector region extraction.
   - Single normalized-embedding source of truth.
2. **Fix masked-face embedding path**
   - Use `extract_periocular_region()` in `detection_pipeline.py`.
3. **Add continuous pose columns**
   - Migration for `visitor_faces.yaw`, `pitch`, `roll`.
   - Update pose-aware search to weight by angular distance.
4. **Tracklet buffer (minimal version)**
   - 2-second sliding window before creating a new visitor.
   - Keep existing behaviour as fallback via setting.

### Phase 2 — Accuracy improvements (Week 3–6)

1. **Per-visitor adaptive thresholds**
   - Add columns, compute on gallery changes, use in resolver.
2. **Gallery quality gating**
   - Reject near-duplicates and faces that lower gallery quality.
3. **Model adapter abstraction**
   - Allow AdaFace/MagFace evaluation without rewriting consumers.
4. **Cross-camera reconciliation job**
   - Search recent visitors across cameras, flag likely duplicates.

### Phase 3 — Scale & performance (Week 7–10)

1. **Inference optimization**
   - TensorRT/OpenVINO for YOLO and ArcFace.
   - Dynamic frame sizing.
2. **Bulk event writes & visitor cache**
   - Reduce DB round-trips.
3. **Centroid pre-filter**
   - Fast candidate pruning before HNSW gallery search.

### Phase 4 — Advanced tracking (Week 11+)

1. **ByteTrack / DeepSORT integration**
   - Stable track IDs; one identity decision per track.
2. **3D face normalization**
   - Evaluate frontalization for extreme angles.
3. **Self-supervised gallery cleaning**
   - Automated pruning and augmentation-based gallery expansion.

---

## 7. Validation & metrics

After each phase, measure these metrics before/after on held-out camera footage:

| Metric | How to compute | Target direction |
|--------|----------------|------------------|
| **Duplicate rate** | Number of review-queue `probable_duplicate` flags / total new visitors | ↓ |
| **False-new rate** | New visitors whose top gallery similarity is > 0.40 / total detections | ↓ |
| **Fragmentation rate** | Same labelled person assigned ≥2 different `visitor_id`s | ↓ |
| **False-merge rate** | Different labelled people assigned same `visitor_id` | ↓ (must stay near 0) |
| **Cross-camera recall** | Same person re-identified on 2+ cameras / total people seen on 2+ cameras | ↑ |
| **p95 frame latency** | Time from capture to DB commit | ↓ or stable |
| **Gallery size per visitor** | Mean / p95 count of `visitor_faces` rows | Keep ≤ target cap |

**Labelling requirement:** To measure fragmentation/false-merge accurately, a
small dataset of manually labelled multi-angle sequences is needed. Until then,
use the review-queue and top-similarity proxies.

---

## 8. Files most likely to change

| File | Why |
|------|-----|
| `backend/app/services/identity_resolver.py` | Pose-aware search, adaptive thresholds, centroid pre-filter. |
| `backend/app/services/auto_enroller.py` | Gallery quality gating, per-visitor statistics, pose columns. |
| `backend/app/services/detection_pipeline.py` | Masked periocular path, tracklet buffering. |
| `backend/app/services/camera_service.py` | Tracklet IDs, multi-camera metadata. |
| `backend/app/cv_pipeline.py` | Tracklet association, pose persistence. |
| `backend/app/ml_models.py` | Model adapter, TensorRT/OpenVINO paths. |
| `backend/app/models.py` | New columns: yaw/pitch/roll, per-visitor threshold. |
| `backend/app/services/review_queue.py` | Cross-camera duplicate flags. |
| New: `backend/app/utils/geometry.py` | Consolidated bbox helpers. |
| New: `backend/app/services/tracker.py` | ByteTrack / DeepSORT integration. |

---

## 9. Open questions to resolve before implementation

1. Is the current deployment single-camera or multi-camera? This determines
   whether Phase 2 cross-camera work is urgent.
2. Is labelled evaluation data available, or should effort focus on automated
   metrics (review queue, false-new rate)?
3. What is the acceptable latency budget? Tracklets add 1–2 seconds of latency
   before registration.
4. Is GPU (CUDA/TensorRT) available in production, or should CPU/OpenVINO
   optimization be prioritized?
5. Should cross-camera duplicate merges be fully automatic or operator-approved?

---

*End of plan.*
