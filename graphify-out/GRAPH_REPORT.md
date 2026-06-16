# Graph Report - .  (2026-06-16)

## Corpus Check
- Corpus is ~27,948 words - fits in a single context window. You may not need a graph.

## Summary
- 536 nodes · 830 edges · 32 communities (23 shown, 9 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.79)
- Token cost: 163,399 input · 163,399 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard UI Components|Dashboard UI Components]]
- [[_COMMUNITY_Backend Core Services|Backend Core Services]]
- [[_COMMUNITY_ORM Models & Services|ORM Models & Services]]
- [[_COMMUNITY_API Routes & Services|API Routes & Services]]
- [[_COMMUNITY_OSNet Neural Network|OSNet Neural Network]]
- [[_COMMUNITY_ML Models Manager|ML Models Manager]]
- [[_COMMUNITY_Camera Service & Utils|Camera Service & Utils]]
- [[_COMMUNITY_API Services & Components|API Services & Components]]
- [[_COMMUNITY_API Schemas|API Schemas]]
- [[_COMMUNITY_Dashboard Pages|Dashboard Pages]]
- [[_COMMUNITY_Database & Main App|Database & Main App]]
- [[_COMMUNITY_CV Pipeline|CV Pipeline]]
- [[_COMMUNITY_Visitors API|Visitors API]]
- [[_COMMUNITY_Identity Resolver|Identity Resolver]]
- [[_COMMUNITY_Alembic Config|Alembic Config]]
- [[_COMMUNITY_Dashboard Layout|Dashboard Layout]]
- [[_COMMUNITY_API Proxy Route|API Proxy Route]]
- [[_COMMUNITY_Analytics Service|Analytics Service]]
- [[_COMMUNITY_App Config|App Config]]
- [[_COMMUNITY_DB Migration Schema|DB Migration Schema]]
- [[_COMMUNITY_Sidebar Component|Sidebar Component]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Visitor Retention|Visitor Retention]]
- [[_COMMUNITY_Stat Card|Stat Card]]
- [[_COMMUNITY_Resolution Result|Resolution Result]]
- [[_COMMUNITY_Processed Detection|Processed Detection]]
- [[_COMMUNITY_Health Check|Health Check]]

## God Nodes (most connected - your core abstractions)
1. `ModelManager` - 18 edges
2. `FastAPI Backend` - 18 edges
3. `OSNet` - 13 edges
4. `Visit Session Tracker` - 13 edges
5. `Visitor (ORM Model)` - 12 edges
6. `Camera Service` - 11 edges
7. `detect()` - 10 edges
8. `VisitTracker` - 10 edges
9. `fetcher()` - 10 edges
10. `Next.js Dashboard` - 10 edges

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

## Communities (32 total, 9 thin omitted)

### Community 0 - "Dashboard UI Components"
Cohesion: 0.05
Nodes (61): Recharts Charting Library, Filter, AnalyticsPage(), RangeKey, sinceFor(), LiveMonitorPage(), startOfTodayISO(), CameraPage() (+53 more)

### Community 1 - "Backend Core Services"
Cohesion: 0.05
Nodes (52): ActiveVisit, Adaptive Centroid Learning, ArcFace Face Recognition, OSNet Body Re-Identification, CPU-Only Inference, Camera Service, Async Database Engine, DetectedPerson (+44 more)

### Community 2 - "ORM Models & Services"
Cohesion: 0.06
Nodes (37): Base, Base class for all ORM models., DetectionEvent, SQLAlchemy ORM models with pgvector embedding columns.  Restaurant visitor track, A single visit session for a visitor., Per-detection audit trail (one row per recognised/created detection)., A unique person seen by the system (auto-registered on first detection)., One face embedding in a visitor's multi-pose gallery. (+29 more)

### Community 3 - "API Routes & Services"
Cohesion: 0.05
Nodes (29): Ambiguity Margin Detection, Analytics Service, Auto-Enrollment Service, Body Fallback Disabled By Default, Detection Pipeline Service, FastAPI Backend, pgvector HNSW Index, Identity Resolution Service (+21 more)

### Community 4 - "OSNet Neural Network"
Cohesion: 0.07
Nodes (22): ChannelGate, Conv1x1, Conv1x1Linear, Conv3x3, ConvLayer, LightConv3x3, OSBlock, OSNet (+14 more)

### Community 5 - "ML Models Manager"
Cohesion: 0.07
Nodes (19): FaceEmbeddingCache, filter_persons(), ModelManager, Singleton ML model manager. Loads YOLOv8n (person detection), InsightFace/ArcFac, Run dummy inference through all models to warm up JIT/graph., Run YOLOv8n person detection. Returns [{bbox, confidence}]., Per-stream ArcFace embedding cache keyed by a dHash of the ALIGNED face     crop, Upscale a tiny crop (ArcFace struggles below ~112px). (+11 more)

### Community 6 - "Camera Service & Utils"
Cohesion: 0.07
Nodes (32): detect(), Detect, auto-register, and recognise visitors in an uploaded image/video., cap_frame_long_side(), cv_image_to_base64(), draw_detections(), encode_jpeg(), extract_video_frames(), _extract_video_frames_from_path() (+24 more)

### Community 7 - "API Services & Components"
Cohesion: 0.1
Nodes (25): ArcFace Face Recognition, Active Visit Dataclass, Activity Feed Component, Activity Page, Analytics Page, Analytics API, Analytics Service, API Fetcher Utility (+17 more)

### Community 8 - "API Schemas"
Cohesion: 0.16
Nodes (23): ActivityEvent, ActivityResponse, AnalyticsSummary, BoundingBox, CameraStartRequest, CameraStatusResponse, DetectionItem, DetectResponse (+15 more)

### Community 9 - "Dashboard Pages"
Cohesion: 0.24
Nodes (20): API Client Library, Activity Feed Component, Activity Timeline Page, Analytics Dashboard Page, Camera Management Page, Charts Component, Formatting Utilities, Live Feed Component (+12 more)

### Community 10 - "Database & Main App"
Cohesion: 0.15
Nodes (12): get_db(), init_db(), Async SQLAlchemy engine and session factory for PostgreSQL + asyncpg., FastAPI dependency that yields an async database session., Ensure pgvector extension is enabled (called on startup)., lifespan(), FastAPI application — Restaurant Visitor Tracker.  Detects persons via webcam/up, Periodically close visits idle past the cooldown / open past the max cap. (+4 more)

### Community 11 - "CV Pipeline"
Cohesion: 0.21
Nodes (11): DetectedPerson, face_passes_quality(), process_frame(), Computer-vision pipeline. Processes a frame through YOLOv8 (persons) → ArcFace (, A single detected person with extracted features., Reject faces too small or low-confidence to yield a reliable embedding., Second chance for a face that failed the size/score gate: crop with margin,, Full CV pipeline for one frame:       1. YOLOv8n → person boxes.       2. One fu (+3 more)

### Community 12 - "Visitors API"
Cohesion: 0.27
Nodes (8): get_visitor(), get_visitor_visits(), list_visitors(), Visitor CRUD + visit history endpoints., List visitors with filtering, sorting, and pagination., _thumbnail_url(), update_visitor(), _visit_summary()

### Community 13 - "Identity Resolver"
Cohesion: 0.27
Nodes (10): _decide_from_face(), Identity resolver — decides NEW vs RETURNING for each detected face.  Strategy:, Resolve a list of detected faces in one DB round-trip.      faces: [{"face_embed, Return the top-2 (visitor_id, similarity) matches per input face embedding,, Closest visitor by body centroid (used only when body fallback is enabled)., Apply thresholds + ambiguity gate to one face's top-2 gallery matches., ResolutionResult, resolve_batch() (+2 more)

### Community 14 - "Alembic Config"
Cohesion: 0.25
Nodes (7): Alembic environment configuration for async migrations., Run migrations in 'offline' mode., Run migrations in 'online' mode with async engine., Run migrations in 'online' mode., run_async_migrations(), run_migrations_offline(), run_migrations_online()

### Community 15 - "Dashboard Layout"
Cohesion: 0.25
Nodes (5): inter, metadata, NAV, Sidebar(), HealthResponse

### Community 16 - "API Proxy Route"
Cohesion: 0.39
Nodes (7): BACKEND_URL, Ctx, DELETE(), forward(), GET(), POST(), PUT()

### Community 17 - "Analytics Service"
Cohesion: 0.38
Nodes (4): hourly(), _range(), Analytics query builders. Staff and soft-deleted visitors are excluded., summary()

### Community 18 - "App Config"
Cohesion: 0.33
Nodes (4): Config, Application configuration via pydantic-settings. All values read from environmen, Settings, BaseSettings

## Knowledge Gaps
- **157 isolated node(s):** `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.`, `Run migrations in 'online' mode with async engine.`, `Run migrations in 'online' mode.`, `restaurant visitor tracking schema  Revision ID: 001_restaurant_schema Revises:` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FastAPI Backend` connect `API Routes & Services` to `Backend Core Services`, `Database & Main App`, `Visitors API`, `Camera Service & Utils`?**
  _High betweenness centrality (0.423) - this node is a cross-community bridge._
- **Why does `ModelManager` connect `ML Models Manager` to `CV Pipeline`?**
  _High betweenness centrality (0.393) - this node is a cross-community bridge._
- **Why does `request()` connect `Dashboard UI Components` to `ML Models Manager`?**
  _High betweenness centrality (0.288) - this node is a cross-community bridge._
- **What connects `Alembic environment configuration for async migrations.`, `Run migrations in 'offline' mode.`, `Run migrations in 'online' mode with async engine.` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Backend Core Services` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `ORM Models & Services` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._