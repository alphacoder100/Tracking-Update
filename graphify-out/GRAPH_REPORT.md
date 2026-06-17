# Graph Report - .  (2026-06-17)

## Corpus Check
- 80 files · ~66,363 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 816 nodes · 1302 edges · 58 communities (38 shown, 20 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 157 edges (avg confidence: 0.77)
- Token cost: 163,399 input · 163,399 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Base, Base class for all ORM models.|Base, Base class for all ORM models.]]
- [[_COMMUNITY_auto_merge_review_duplicates(), get_review_queue()|auto_merge_review_duplicates(), get_review_queue()]]
- [[_COMMUNITY_Ambiguity Margin Detection, Analytics Service|Ambiguity Margin Detection, Analytics Service]]
- [[_COMMUNITY_ActiveVisit, Adaptive Centroid Learning|ActiveVisit, Adaptive Centroid Learning]]
- [[_COMMUNITY_ChannelGate, .forward()|ChannelGate, .forward()]]
- [[_COMMUNITY__compute_iou(), DetectedPerson|_compute_iou(), DetectedPerson]]
- [[_COMMUNITY_auto_enroller.py, face_quality.py|auto_enroller.py, face_quality.py]]
- [[_COMMUNITY_camera_status(), ActivityEvent|camera_status(), ActivityEvent]]
- [[_COMMUNITY_draw_detections(), Draw labelled bounding boxes for the live feed.      annotations list of {bbo|draw_detections(), Draw labelled bounding boxes for the live feed.      annotations: list of {bbo]]
- [[_COMMUNITY_ArcFace Face Recognition, Active Visit Dataclass|ArcFace Face Recognition, Active Visit Dataclass]]
- [[_COMMUNITY_CameraPage(), EventIcon()|CameraPage(), EventIcon()]]
- [[_COMMUNITY_get_db(), init_db()|get_db(), init_db()]]
- [[_COMMUNITY_inter, metadata|inter, metadata]]
- [[_COMMUNITY_ActivityPage(), Filter|ActivityPage(), Filter]]
- [[_COMMUNITY_ModelManager, .detect_persons()|ModelManager, .detect_persons()]]
- [[_COMMUNITY_API Client Library, Activity Feed Component|API Client Library, Activity Feed Component]]
- [[_COMMUNITY_Recharts Charting Library, AnalyticsPage()|Recharts Charting Library, AnalyticsPage()]]
- [[_COMMUNITY_LiveMonitorPage(), ActivityFeed()|LiveMonitorPage(), ActivityFeed()]]
- [[_COMMUNITY_apply_clahe(), apply_gamma_correction()|apply_clahe(), apply_gamma_correction()]]
- [[_COMMUNITY_check_device(), check_keys()|check_device(), check_keys()]]
- [[_COMMUNITY__device_status(), Current device state + GPU capability for the dashboard.|_device_status(), Current device state + GPU capability for the dashboard.]]
- [[_COMMUNITY_temporal_consistency.py, _bbox_center_distance()|temporal_consistency.py, _bbox_center_distance()]]
- [[_COMMUNITY_camera_snapshot(), camera_stream()|camera_snapshot(), camera_stream()]]
- [[_COMMUNITY_mask_detector.py, extract_periocular_region()|mask_detector.py, extract_periocular_region()]]
- [[_COMMUNITY_analytics_service.py, confidence_weighted_summary()|analytics_service.py, confidence_weighted_summary()]]
- [[_COMMUNITY_.get(), .put()|.get(), .put()]]
- [[_COMMUNITY_detect(), POST apidetect — one-shot detection from an uploaded image or video.|detect(), POST /api/detect — one-shot detection from an uploaded image or video.]]
- [[_COMMUNITY_do_run_migrations(), Alembic environment configuration for async migrations.|do_run_migrations(), Alembic environment configuration for async migrations.]]
- [[_COMMUNITY_frame_signature(), Cheap perceptual fingerprint of a frame (small grayscale thumbnail).|frame_signature(), Cheap perceptual fingerprint of a frame (small grayscale thumbnail).]]
- [[_COMMUNITY_Toggle(), page.tsx|Toggle(), page.tsx]]
- [[_COMMUNITY_EmptyState(), Skeleton()|EmptyState(), Skeleton()]]
- [[_COMMUNITY_route.ts, BACKEND_URL|route.ts, BACKEND_URL]]
- [[_COMMUNITY_camera_service.py, _bbox_center_in_roi()|camera_service.py, _bbox_center_in_roi()]]
- [[_COMMUNITY_004_partition_detection_events.py, _bounds()|004_partition_detection_events.py, _bounds()]]
- [[_COMMUNITY_Config, parse_cors()|Config, parse_cors()]]
- [[_COMMUNITY_.extract_face_data(), ._upscale_for_arcface()|.extract_face_data(), ._upscale_for_arcface()]]
- [[_COMMUNITY_001_restaurant_schema.py, downgrade()|001_restaurant_schema.py, downgrade()]]
- [[_COMMUNITY_007_auto_tuning_log.py, downgrade()|007_auto_tuning_log.py, downgrade()]]
- [[_COMMUNITY_002_pose_bin_consent.py, downgrade()|002_pose_bin_consent.py, downgrade()]]
- [[_COMMUNITY_003_consent_system.py, downgrade()|003_consent_system.py, downgrade()]]
- [[_COMMUNITY_005_runtime_settings.py, downgrade()|005_runtime_settings.py, downgrade()]]
- [[_COMMUNITY_006_review_queue.py, downgrade()|006_review_queue.py, downgrade()]]
- [[_COMMUNITY_008_review_queue_match.py, downgrade()|008_review_queue_match.py, downgrade()]]
- [[_COMMUNITY_009_face_crop_clarity.py, downgrade()|009_face_crop_clarity.py, downgrade()]]
- [[_COMMUNITY_test_camera.py, Test camera indices 0 to max_index-1|test_camera.py, Test camera indices 0 to max_index-1]]
- [[_COMMUNITY_Dashboard Layout, Sidebar Component|Dashboard Layout, Sidebar Component]]
- [[_COMMUNITY_next.config.js, nextConfig|next.config.js, nextConfig]]
- [[_COMMUNITY_config, tailwind.config.ts|config, tailwind.config.ts]]
- [[_COMMUNITY_Visitor Data Retention Policy|Visitor Data Retention Policy]]
- [[_COMMUNITY_Return (crop, offset_x, offset_y). No ROI → the full frame at (0, 0).|Return (crop, offset_x, offset_y). No ROI → the full frame at (0, 0).]]
- [[_COMMUNITY_Shift crop-relative boxeslandmarks back into full-frame coords (in place).|Shift crop-relative boxes/landmarks back into full-frame coords (in place).]]
- [[_COMMUNITY_Stat Card Component|Stat Card Component]]
- [[_COMMUNITY_ResolutionResult|ResolutionResult]]
- [[_COMMUNITY_ProcessedDetection|ProcessedDetection]]
- [[_COMMUNITY_Health Check Endpoint|Health Check Endpoint]]

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
- `Ambiguity Margin Detection` --rationale_for--> `Identity Resolution Service`  [EXTRACTED]
  ULTIMATE_RESTAURANT_TRACKER_PLAN.md → backend/app/services/identity_resolver.py
- `Body Fallback Disabled By Default` --rationale_for--> `Identity Resolution Service`  [EXTRACTED]
  ULTIMATE_RESTAURANT_TRACKER_PLAN.md → backend/app/services/identity_resolver.py
- `Single Worker Requirement` --rationale_for--> `Visit Session Tracker`  [EXTRACTED]
  README.md → backend/app/services/visit_tracker.py

## Communities (58 total, 20 thin omitted)

### Community 0 - "Base, Base class for all ORM models."
Cohesion: 0.05
Nodes (43): Base, Base class for all ORM models., DetectionEvent, SQLAlchemy ORM models with pgvector embedding columns.  Restaurant visitor tra, A single visit session for a visitor., Per-detection audit trail (one row per recognised/created detection)., A unique person seen by the system (auto-registered on first detection)., One face embedding in a visitor's multi-pose gallery. (+35 more)

### Community 1 - "auto_merge_review_duplicates(), get_review_queue()"
Cohesion: 0.05
Nodes (49): auto_merge_review_duplicates(), get_review_queue(), Return unresolved human-review flags., Merge all probable-duplicate flags into their matched visitor (global dedup)., Mark a review flag as resolved., resolve_review_flag(), mark_staff(), merge_visitor() (+41 more)

### Community 2 - "Ambiguity Margin Detection, Analytics Service"
Cohesion: 0.05
Nodes (41): Ambiguity Margin Detection, Analytics Service, Auto-Enrollment Service, Body Fallback Disabled By Default, Detection Pipeline Service, FastAPI Backend, pgvector HNSW Index, Identity Resolution Service (+33 more)

### Community 3 - "ActiveVisit, Adaptive Centroid Learning"
Cohesion: 0.05
Nodes (52): ActiveVisit, Adaptive Centroid Learning, ArcFace Face Recognition, OSNet Body Re-Identification, CPU-Only Inference, Camera Service, Async Database Engine, DetectedPerson (+44 more)

### Community 4 - "ChannelGate, .forward()"
Cohesion: 0.07
Nodes (22): ChannelGate, Conv1x1, Conv1x1Linear, Conv3x3, ConvLayer, LightConv3x3, OSBlock, OSNet (+14 more)

### Community 5 - "_compute_iou(), DetectedPerson"
Cohesion: 0.09
Nodes (28): _compute_iou(), DetectedPerson, estimate_pose(), face_passes_quality(), FacePose, _is_group_frame(), PoseBin, process_frame() (+20 more)

### Community 6 - "auto_enroller.py, face_quality.py"
Cohesion: 0.1
Nodes (28): add_face_to_gallery(), _add_gallery_face(), clean_visitor_gallery(), _delete_gallery_face(), _find_eviction_candidate(), _is_diverse_embedding(), Auto-enroller + gallery manager.    • New visitor    → create record (centroid, Create a new visitor with the first face seeding both centroid and gallery. (+20 more)

### Community 7 - "camera_status(), ActivityEvent"
Cohesion: 0.13
Nodes (27): camera_status(), ActivityEvent, ActivityResponse, AnalyticsSummary, BoundingBox, CameraStartRequest, CameraStatusResponse, ConsentUpdateRequest (+19 more)

### Community 8 - "draw_detections(), Draw labelled bounding boxes for the live feed.      annotations: list of {bbo"
Cohesion: 0.11
Nodes (14): draw_detections(), Draw labelled bounding boxes for the live feed.      annotations: list of {bbo, CameraService, _parse_source(), Fresh synchronization primitives + counters for a new run., Spawn capture + inference workers + consumer; tear them all down together., Continuously grab frames, keeping only the newest (drops backlog)., Encode the latest captured frame at a steady preview rate, overlaying         t (+6 more)

### Community 9 - "ArcFace Face Recognition, Active Visit Dataclass"
Cohesion: 0.1
Nodes (25): ArcFace Face Recognition, Active Visit Dataclass, Activity Feed Component, Activity Page, Analytics Page, Analytics API, Analytics Service, API Fetcher Utility (+17 more)

### Community 10 - "CameraPage(), EventIcon()"
Cohesion: 0.13
Nodes (18): CameraPage(), MonthlyBar(), Badge(), VisitorAvatar(), CONSENT_LABEL, CONSENT_TONE, monthlyBuckets(), VisitorProfilePage() (+10 more)

### Community 11 - "get_db(), init_db()"
Cohesion: 0.11
Nodes (18): get_db(), init_db(), Async SQLAlchemy engine and session factory for PostgreSQL + asyncpg., FastAPI dependency that yields an async database session., Ensure pgvector extension is enabled (called on startup)., _auto_tuning_loop(), lifespan(), FastAPI application — Restaurant Visitor Tracker.  Detects persons via webcam/ (+10 more)

### Community 12 - "inter, metadata"
Cohesion: 0.1
Nodes (17): inter, metadata, NAV, Sidebar(), AnalyticsSummary, BoundingBox, ConfidenceWeighted, ConfidenceWeightedSummary (+9 more)

### Community 13 - "ActivityPage(), Filter"
Cohesion: 0.14
Nodes (15): Filter, BadgeTone, Button(), buttonClasses, ButtonVariant, Card(), ErrorState(), Input() (+7 more)

### Community 14 - "ModelManager, .detect_persons()"
Cohesion: 0.14
Nodes (9): ModelManager, Load all models into memory on `device`. Call once on startup., Tear down all models and reload them on a new device. Blocking/CPU-GPU, Run dummy inference through all models to warm up JIT/graph., Run YOLOv8n person detection. Returns [{bbox, confidence}]., Batched OSNet body-embedding extraction (one forward pass for all crops)., Singleton holding all pre-trained models in CPU memory.     Call `load_all()` o, load_pretrained_weights() (+1 more)

### Community 15 - "API Client Library, Activity Feed Component"
Cohesion: 0.24
Nodes (20): API Client Library, Activity Feed Component, Activity Timeline Page, Analytics Dashboard Page, Camera Management Page, Charts Component, Formatting Utilities, Live Feed Component (+12 more)

### Community 16 - "Recharts Charting Library, AnalyticsPage()"
Cohesion: 0.14
Nodes (17): Recharts Charting Library, AnalyticsPage(), RangeKey, sinceFor(), DailyVisitsArea(), DetectionQualityBar(), DONUT_COLORS, FrequencyBar() (+9 more)

### Community 17 - "LiveMonitorPage(), ActivityFeed()"
Cohesion: 0.2
Nodes (10): ActivityFeed(), DetectionFeed(), CardTitle(), PageHeader(), api, ApiError, fetcher(), request() (+2 more)

### Community 18 - "apply_clahe(), apply_gamma_correction()"
Cohesion: 0.14
Nodes (15): apply_clahe(), apply_gamma_correction(), cap_frame_long_side(), cv_image_to_base64(), encode_jpeg(), _extract_video_frames_from_path(), preprocess_face_for_recognition(), Image and video utility functions. (+7 more)

### Community 19 - "check_device(), check_keys()"
Cohesion: 0.12
Nodes (13): clean_visitor_faces(), DevicePatch, get_device(), get_settings(), patch_settings(), Runtime configuration API — change thresholds without restarting the server., Report the active processing device and whether a CUDA GPU is usable., Auto-remove unclear faces from a visitor's gallery (clarity-based pruning). (+5 more)

### Community 20 - "_device_status(), Current device state + GPU capability for the dashboard."
Cohesion: 0.16
Nodes (12): _device_status(), Current device state + GPU capability for the dashboard., Switch processing between CPU and GPU live — reloads all models onto the new, set_device(), cuda_available(), gpu_info(), Singleton ML model manager. Loads YOLOv8n (person detection), InsightFace/ArcFa, True when a usable CUDA GPU is visible to torch (CUDA torch build present). (+4 more)

### Community 21 - "temporal_consistency.py, _bbox_center_distance()"
Cohesion: 0.18
Nodes (7): _bbox_center_distance(), _cosine_sim(), Temporal consistency gate.  Prevents same-person fragmentation: if a "new" det, Remove all entries for a visitor (e.g. after opt-out)., Record a confirmed detection., Return visitor_id if this 'new' detection looks like a recently seen         vi, TemporalConsistencyGate

### Community 22 - "camera_snapshot(), camera_stream()"
Cohesion: 0.15
Nodes (8): camera_stream(), Camera control endpoints., Live MJPEG push stream (multipart/x-mixed-replace). Frames are pushed to the, Upload a video file and start streaming it through the detection pipeline., start_camera(), upload_video_stream(), is_video_upload(), True when an uploaded file looks like a video (by content-type or extension).

### Community 23 - "mask_detector.py, extract_periocular_region()"
Cohesion: 0.19
Nodes (12): extract_periocular_region(), is_masked(), _lower_face_brightness(), _lower_std(), masked_threshold_offset(), Mask detection via periocular heuristic.  When the lower face (nose+mouth regi, Mean pixel value of the lower 40% of the face crop (nose-mouth zone)., Std-dev of the upper 40% of the face crop (forehead-eye zone). (+4 more)

### Community 24 - "analytics_service.py, confidence_weighted_summary()"
Cohesion: 0.27
Nodes (9): confidence_weighted_summary(), detection_quality_report(), frequency(), hourly(), _range(), Analytics query builders. Staff and soft-deleted visitors are excluded. Confide, Like summary() but weights each detection by face_similarity so that     low-co, Breakdown of detection quality bands to surface systematic issues.     Bands: h (+1 more)

### Community 25 - ".get(), .put()"
Cohesion: 0.22
Nodes (6): filter_persons(), Detect EVERY face in an image in a single ArcFace pass.         Returns [{embed, Detection + per-face cached recognition (skips ArcFace on a cache hit)., Filter a detect_all() result down to person-class boxes (COCO class 0)., compute_dhash(), Difference hash (dHash): a perceptual fingerprint robust to compression     noi

### Community 26 - "detect(), POST /api/detect — one-shot detection from an uploaded image or video."
Cohesion: 0.2
Nodes (9): detect(), POST /api/detect — one-shot detection from an uploaded image or video., Detect, auto-register, and recognise visitors in an uploaded image/video., extract_video_frames(), file_to_cv_image(), frames_are_similar(), Extract frames from an uploaded video file at the configured FPS rate., True if two frame signatures differ by less than `threshold` (mean abs diff). (+1 more)

### Community 27 - "do_run_migrations(), Alembic environment configuration for async migrations."
Cohesion: 0.25
Nodes (7): Alembic environment configuration for async migrations., Run migrations in 'offline' mode., Run migrations in 'online' mode with async engine., Run migrations in 'online' mode., run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 28 - "frame_signature(), Cheap perceptual fingerprint of a frame (small grayscale thumbnail)."
Cohesion: 0.22
Nodes (7): frame_signature(), Cheap perceptual fingerprint of a frame (small grayscale thumbnail)., Run a CPU-heavy inference function off the event loop, bounded by the     globa, run_inference(), Block until a frame newer than the last claimed one exists, then take         i, Pull the newest frame and run the CV pipeline off the event loop.          Whe, _roi_crop()

### Community 29 - "Toggle(), page.tsx"
Cohesion: 0.22
Nodes (5): Toggle(), AdminSettings, DeviceStatus, DEVICE_OPTIONS, GROUPS

### Community 30 - "EmptyState(), Skeleton()"
Cohesion: 0.22
Nodes (6): EmptyState(), Skeleton(), ComparePhoto(), FLAG_META, Tone, TONE_TILE

### Community 31 - "route.ts, BACKEND_URL"
Cohesion: 0.36
Nodes (8): BACKEND_URL, Ctx, DELETE(), forward(), GET(), PATCH(), POST(), PUT()

### Community 32 - "camera_service.py, _bbox_center_in_roi()"
Cohesion: 0.29
Nodes (6): _bbox_center_in_roi(), _filter_by_roi(), _offset_detections(), Camera service — background webcam/RTSP/file processor.  Two execution modes (, Check if the center of a detection bbox falls within the ROI., Keep only detections whose *drawn* box falls inside the ROI.      The label is

### Community 33 - "004_partition_detection_events.py, _bounds()"
Cohesion: 0.36
Nodes (6): _bounds(), _months(), _partition_name(), Monthly partitioning of detection_events (range on detected_at).  This migrati, Yield (year, month) for n consecutive months starting at start., upgrade()

### Community 34 - "Config, parse_cors()"
Cohesion: 0.33
Nodes (4): Config, Application configuration via pydantic-settings. All values read from environme, Settings, BaseSettings

## Knowledge Gaps
- **266 isolated node(s):** `Test camera indices 0 to max_index-1`, `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.`, `Run migrations in 'online' mode with async engine.`, `Run migrations in 'online' mode.` (+261 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `request()` connect `LiveMonitorPage(), ActivityFeed()` to `ModelManager, .detect_persons()`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `FastAPI Backend` connect `Ambiguity Margin Detection, Analytics Service` to `auto_merge_review_duplicates(), get_review_queue()`, `ActiveVisit, Adaptive Centroid Learning`, `get_db(), init_db()`, `apply_clahe(), apply_gamma_correction()`, `check_device(), check_keys()`, `camera_snapshot(), camera_stream()`, `detect(), POST /api/detect — one-shot detection from an uploaded image or video.`?**
  _High betweenness centrality (0.242) - this node is a cross-community bridge._
- **Why does `ModelManager` connect `ModelManager, .detect_persons()` to `.extract_face_data(), ._upscale_for_arcface()`, `_compute_iou(), DetectedPerson`, `check_device(), check_keys()`, `_device_status(), Current device state + GPU capability for the dashboard.`, `.get(), .put()`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `str` (e.g. with `._load_yolo()` and `._load_osnet()`) actually correct?**
  _`str` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `ModelManager` (e.g. with `PoseBin` and `FacePose`) actually correct?**
  _`ModelManager` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Test camera indices 0 to max_index-1`, `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.` to the rest of the system?**
  _266 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Base, Base class for all ORM models.` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._