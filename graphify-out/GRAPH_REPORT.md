# Graph Report - .  (2026-06-17)

## Corpus Check
- 80 files · ~66,991 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 856 nodes · 1362 edges · 70 communities (50 shown, 20 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 158 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]

## God Nodes (most connected - your core abstractions)
1. `ModelManager` - 23 edges
2. `CameraService` - 19 edges
3. `FastAPI Backend` - 19 edges
4. `OSNet` - 13 edges
5. `Visit Session Tracker` - 13 edges
6. `Visitor` - 12 edges
7. `VisitTracker` - 12 edges
8. `fetcher()` - 12 edges
9. `Visitor (ORM Model)` - 12 edges
10. `FaceEmbeddingCache` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Visit Session Tracker` --shares_data_with--> `Visits Table`  [EXTRACTED]
  backend/app/services/visit_tracker.py → ULTIMATE_RESTAURANT_TRACKER_PLAN.md
- `Identity Resolution Service` --references--> `pgvector HNSW Index`  [EXTRACTED]
  backend/app/services/identity_resolver.py → ULTIMATE_RESTAURANT_TRACKER_PLAN.md
- `Identity Resolution Service` --rationale_for--> `Ambiguity Margin Detection`  [EXTRACTED]
  backend/app/services/identity_resolver.py → ULTIMATE_RESTAURANT_TRACKER_PLAN.md
- `Identity Resolution Service` --rationale_for--> `Body Fallback Disabled By Default`  [EXTRACTED]
  backend/app/services/identity_resolver.py → ULTIMATE_RESTAURANT_TRACKER_PLAN.md
- `Visit Session Tracker` --rationale_for--> `Single Worker Requirement`  [EXTRACTED]
  backend/app/services/visit_tracker.py → README.md

## Communities (70 total, 20 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (43): Base, Base class for all ORM models., DetectionEvent, SQLAlchemy ORM models with pgvector embedding columns.  Restaurant visitor tra, A single visit session for a visitor., Per-detection audit trail (one row per recognised/created detection)., A unique person seen by the system (auto-registered on first detection)., One face embedding in a visitor's multi-pose gallery. (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (31): _device_status(), get_device(), Current device state + GPU capability for the dashboard., Report the active processing device and whether a CUDA GPU is usable., Switch processing between CPU and GPU live — reloads all models onto the new, set_device(), cuda_available(), filter_persons() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (39): mark_staff(), merge_visitor(), Admin endpoints — merge duplicate visitors, mark staff., Merge `visitor_id` INTO target_visitor_id, then delete the source., delete_visitor(), get_visitor(), get_visitor_thumbnail(), get_visitor_visits() (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (22): ChannelGate, Conv1x1, Conv1x1Linear, Conv3x3, ConvLayer, LightConv3x3, OSBlock, OSNet (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (31): camera_status(), camera_stream(), Camera control endpoints., Live MJPEG push stream (multipart/x-mixed-replace). Frames are pushed to the, start_camera(), ActivityEvent, ActivityResponse, AnalyticsSummary (+23 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (28): _compute_iou(), DetectedPerson, estimate_pose(), face_passes_quality(), FacePose, _is_group_frame(), PoseBin, process_frame() (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (28): app_cv_pipeline, app_utils, cv2, numpy, pathlib, add_face_to_gallery(), _add_gallery_face(), _delete_gallery_face() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (18): Filter, BadgeTone, Button(), buttonClasses, ButtonVariant, Card(), EmptyState(), ErrorState() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (25): ArcFace Face Recognition, Active Visit Dataclass, Activity Feed Component, Activity Page, Analytics Page, Analytics API, Analytics Service, API Fetcher Utility (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (21): Recharts Charting Library, AnalyticsPage(), RangeKey, sinceFor(), DailyVisitsArea(), DetectionQualityBar(), DONUT_COLORS, FrequencyBar() (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): get_db(), init_db(), Async SQLAlchemy engine and session factory for PostgreSQL + asyncpg., FastAPI dependency that yields an async database session., Ensure pgvector extension is enabled (called on startup)., _auto_tuning_loop(), lifespan(), FastAPI application — Restaurant Visitor Tracker.  Detects persons via webcam/ (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.24
Nodes (20): API Client Library, Activity Feed Component, Activity Timeline Page, Analytics Dashboard Page, Camera Management Page, Charts Component, Formatting Utilities, Live Feed Component (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (14): Badge(), VisitorTable(), CONSENT_LABEL, CONSENT_TONE, monthlyBuckets(), VisitorProfilePage(), formatDateTime(), formatTime() (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (20): ActiveVisit, Adaptive Centroid Learning, DetectionEvent (ORM Model), Multi-Pose Face Gallery, HNSW Vector Indexes, Single Worker Requirement, Visit (ORM Model), Visit Session Tracker (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (17): app_config, app_models, app_services_visit_tracker, datetime, logging, flag_ambiguous_visitor(), flag_opted_out_match(), _insert_flag() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (10): ActivityFeed(), DetectionFeed(), CardTitle(), PageHeader(), api, ApiError, fetcher(), request() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (14): DevicePatch, get_settings(), patch_settings(), Runtime configuration API — change thresholds without restarting the server., Reload persisted settings from the runtime_settings table (if present)., Reload persisted settings from the runtime_settings table (if present)., Return current runtime values for all patchable settings., Update one or more runtime settings in-process (survives until next restart). (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (15): apply_clahe(), apply_gamma_correction(), cap_frame_long_side(), cv_image_to_base64(), encode_jpeg(), _extract_video_frames_from_path(), preprocess_face_for_recognition(), Image and video utility functions. (+7 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (8): CameraService, _parse_source(), Fresh synchronization primitives + counters for a new run., Spawn capture + inference workers + consumer; tear them all down together., Continuously grab frames, keeping only the newest (drops backlog)., Post-process inference results: ROI filter, DB write, and publish the         d, 0' → int 0 (webcam index); anything else stays a string (URL/path)., Singleton background camera processor.

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (14): Ambiguity Margin Detection, Analytics Service, Auto-Enrollment Service, Body Fallback Disabled By Default, Detection Pipeline Service, FastAPI Backend, pgvector HNSW Index, Identity Resolution Service (+6 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (11): NAV, AnalyticsSummary, BoundingBox, ConfidenceWeighted, DetectionItem, DetectResponse, HealthResponse, LiveFeedMessage (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (11): c_users_jana_bishwanath_desktop_person_tracking_tracking_update_dashboard_components_ui_tsx, c_users_jana_bishwanath_desktop_person_tracking_tracking_update_dashboard_lib_api_ts, c_users_jana_bishwanath_desktop_person_tracking_tracking_update_dashboard_lib_format_ts, c_users_jana_bishwanath_desktop_person_tracking_tracking_update_dashboard_lib_types_ts, link, lucide_react, react, FLAG_META (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (14): ArcFace Face Recognition, CPU-Only Inference, Camera Service, FaceEmbeddingCache, FastAPI Application, Frame Deduplication, ModelManager, OSNet Body Re-identification (+6 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (7): _bbox_center_distance(), _cosine_sim(), Temporal consistency gate.  Prevents same-person fragmentation: if a "new" det, Remove all entries for a visitor (e.g. after opt-out)., Record a confirmed detection., Return visitor_id if this 'new' detection looks like a recently seen         vi, TemporalConsistencyGate

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (12): extract_periocular_region(), is_masked(), _lower_face_brightness(), _lower_std(), masked_threshold_offset(), Mask detection via periocular heuristic.  When the lower face (nose+mouth regi, Mean pixel value of the lower 40% of the face crop (nose-mouth zone)., Std-dev of the upper 40% of the face crop (forehead-eye zone). (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (12): Upload a video file and start streaming it through the detection pipeline., upload_video_stream(), detect(), Detect, auto-register, and recognise visitors in an uploaded image/video., extract_video_frames(), file_to_cv_image(), is_video_upload(), Extract frames from an uploaded video file at the configured FPS rate. (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.27
Nodes (9): confidence_weighted_summary(), detection_quality_report(), frequency(), hourly(), _range(), Analytics query builders. Staff and soft-deleted visitors are excluded. Confide, Like summary() but weights each detection by face_similarity so that     low-co, Breakdown of detection quality bands to surface systematic issues.     Bands: h (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.2
Nodes (8): Config, Application configuration via pydantic-settings. All values read from environme, Settings, BaseSettings, json, pydantic, pydantic_settings, typing

### Community 28 - "Community 28"
Cohesion: 0.2
Nodes (10): auto_merge_review_duplicates(), Merge all probable-duplicate flags into their matched visitor (global dedup)., Merge probable-duplicate flags above a confidence floor into their matched, Rebuild a visitor's face (and body) centroid from its current gallery faces,, recompute_centroid_from_gallery(), auto_merge_duplicates(), Global one-click dedup: merge every unresolved `probable_duplicate` into the, Global one-click dedup: merge every unresolved `probable_duplicate` whose     r (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.24
Nodes (8): CameraPage(), VisitorAvatar(), imageUrl(), uptime(), RegionOfInterest, RoiResponse, VisitorListResponse, ComparePhoto()

### Community 30 - "Community 30"
Cohesion: 0.22
Nodes (10): OSNet Body Re-Identification, DetectedPerson, Face Quality Gating, YOLOv8 Person Detection, compute_dhash Utility, POST /api/detect, normalize_embedding Utility, process_detections Function (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (7): Alembic environment configuration for async migrations., Run migrations in 'offline' mode., Run migrations in 'online' mode with async engine., Run migrations in 'online' mode., run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 32 - "Community 32"
Cohesion: 0.22
Nodes (4): analytics_confidence_weighted(), analytics_detection_quality(), Summary with confidence-weighted unique visitor count., Detection quality band breakdown (high / medium / low confidence).

### Community 33 - "Community 33"
Cohesion: 0.36
Nodes (8): BACKEND_URL, Ctx, DELETE(), forward(), GET(), PATCH(), POST(), PUT()

### Community 34 - "Community 34"
Cohesion: 0.22
Nodes (7): frame_signature(), frames_are_similar(), Cheap perceptual fingerprint of a frame (small grayscale thumbnail)., True if two frame signatures differ by less than `threshold` (mean abs diff)., Block until a frame newer than the last claimed one exists, then take         i, Pull the newest frame and run the CV pipeline off the event loop.          Whe, _roi_crop()

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (8): Async Database Engine, Identity Resolution Strategy, Settings (App Config), Database Session Dependency, pgvector Extension, resolve_batch Function, Settings API, API Key Verification

### Community 36 - "Community 36"
Cohesion: 0.29
Nodes (6): _bbox_center_in_roi(), _filter_by_roi(), _offset_detections(), Camera service — background webcam/RTSP/file processor.  Two execution modes (, Check if the center of a detection bbox falls within the ROI., Keep only detections whose *drawn* box falls inside the ROI.      The label is

### Community 37 - "Community 37"
Cohesion: 0.32
Nodes (5): draw_detections(), Draw labelled bounding boxes for the live feed.      annotations: list of {bbo, Encode the latest captured frame at a steady preview rate, overlaying         t, Visualize the detection zone on a frame (in place): dim everything         outs, _sleep_remaining()

### Community 38 - "Community 38"
Cohesion: 0.36
Nodes (6): _bounds(), _months(), _partition_name(), Monthly partitioning of detection_events (range on detected_at).  This migrati, Yield (year, month) for n consecutive months starting at start., upgrade()

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (6): Mark a review flag as resolved., Mark a review flag as resolved., resolve_review_flag(), Mark a review flag as resolved., Mark a review flag as resolved., resolve_flag()

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (6): clean_visitor_faces(), Auto-remove unclear faces from a visitor's gallery (clarity-based pruning)., Auto-remove unclear faces from a visitor's gallery (clarity-based pruning)., clean_visitor_gallery(), Score every gallery face for clarity (landmark frontality + blur + det_score), Score every gallery face for clarity (landmark frontality + blur + det_score)

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (5): API routers and shared dependencies., Validate the X-API-Key header against the configured key., Validate against ADMIN_API_KEY (falls back to API_KEY when admin key not set)., verify_admin_api_key(), verify_api_key()

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (5): compute_clarity(), Face clarity scoring — "is this face clearly visible?".  Combines three cheap,, Laplacian-variance sharpness normalized to [0, 1]; None if no crop., Return clarity sub-scores and a combined score in [0, 1].      With a crop ava, sharpness_score()

### Community 43 - "Community 43"
Cohesion: 0.4
Nodes (3): inter, metadata, Sidebar()

### Community 44 - "Community 44"
Cohesion: 0.5
Nodes (4): get_review_queue(), Return unresolved human-review flags., get_pending_flags(), Return unresolved flags for the admin UI.

### Community 48 - "Community 48"
Cohesion: 0.5
Nodes (3): list_activity(), Activity feed — recent detection events for the dashboard timeline., Most-recent detection events, newest first, with visitor info joined.

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (3): live_feed(), WebSocket /ws/live-feed — streams annotated frames + live stats., Push the latest annotated frame and live stats at the camera FPS.

## Knowledge Gaps
- **276 isolated node(s):** `Test camera indices 0 to max_index-1`, `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.`, `Run migrations in 'online' mode with async engine.`, `Run migrations in 'online' mode.` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `request()` connect `Community 15` to `Community 1`?**
  _High betweenness centrality (0.254) - this node is a cross-community bridge._
- **Why does `FastAPI Backend` connect `Community 19` to `Community 32`, `Community 2`, `Community 4`, `Community 41`, `Community 10`, `Community 13`, `Community 48`, `Community 17`, `Community 16`, `Community 49`, `Community 22`, `Community 55`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `ModelManager` connect `Community 1` to `Community 16`, `Community 5`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `str` (e.g. with `._load_yolo()` and `._load_osnet()`) actually correct?**
  _`str` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `ModelManager` (e.g. with `PoseBin` and `FacePose`) actually correct?**
  _`ModelManager` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Test camera indices 0 to max_index-1`, `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._