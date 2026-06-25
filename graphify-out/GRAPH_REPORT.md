# Graph Report - .  (2026-06-26)

## Corpus Check
- 122 files · ~187,998 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 314 nodes · 305 edges · 88 communities (17 shown, 71 thin omitted)
- Extraction: 74% EXTRACTED · 25% INFERRED · 1% AMBIGUOUS · INFERRED: 77 edges (avg confidence: 0.89)
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
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]

## God Nodes (most connected - your core abstractions)
1. `Visitor (ORM Model)` - 12 edges
2. `Face Crop 25cff750` - 10 edges
3. `Visitor 7eca5017-112f-45c7-a132-1acf7c7ddaff` - 10 edges
4. `process_frame (CV Pipeline)` - 9 edges
5. `VisitTracker` - 9 edges
6. `CameraService` - 8 edges
7. `Backend Python Requirements` - 7 edges
8. `ModelManager` - 7 edges
9. `process_detections Function` - 7 edges
10. `Settings (App Config)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Fused-Score Re-Ranking of Candidates` --semantically_similar_to--> `Offline / Nightly Global Deduplication`  [INFERRED] [semantically similar]
  IMPROVEMENT_PLAN.md → ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md
- `HNSW ef_search Tuning` --implements--> `pgvector Extension`  [EXTRACTED]
  IMPROVEMENT_PLAN.md → backend/requirements.txt
- `Tracklet Fast-Path` --implements--> `Tracklet-Based Identity Resolution`  [INFERRED]
  IMPROVEMENT_PLAN.md → ADVANCED_OPTIMIZATION_AND_DEDUPLICATION_PLAN.md
- `Restaurant Tracker Dashboard` --conceptually_related_to--> `Restaurant Visitor Tracker`  [INFERRED]
  dashboard/README.md → README.md
- `Backend Service` --implements--> `Restaurant Visitor Tracker`  [INFERRED]
  docker-compose.yml → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Part 1: Implemented Improvements** — IMPROVEMENT_hnsw_ef_search_tuning, IMPROVEMENT_per_person_arcface_fallback_gating, IMPROVEMENT_empty_frame_early_out, IMPROVEMENT_tracklet_fast_path [EXTRACTED 1.00]
- **Part 2: Recommended Next Steps** — IMPROVEMENT_consolidate_per_match_db_round_trips, IMPROVEMENT_masked_face_periocular_batching, IMPROVEMENT_persist_ef_search_at_role_level, IMPROVEMENT_fused_score_reranking, IMPROVEMENT_detector_input_size_auto_selection, IMPROVEMENT_model_upgrades_evaluate [EXTRACTED 1.00]
- **Backend CV/ML Dependency Stack** — CONCEPT_fastapi, CONCEPT_pgvector, CONCEPT_alembic, CONCEPT_insightface, CONCEPT_ultralytics, CONCEPT_onnxruntime, CONCEPT_imageio_ffmpeg [EXTRACTED 1.00]
- **Phase 1: Body Re-ID Activation & Tuning** — ADVANCED_OPTIMIZATION_cross_camera_body_reid_fusion, CONCEPT_osnet, CONCEPT_arcface [EXTRACTED 1.00]
- **Phase 2: Pose-Adaptive Thresholding** — ADVANCED_OPTIMIZATION_dynamic_pose_adaptive_thresholds, MODULE_identity_resolver [EXTRACTED 1.00]
- **Phase 3: Nightly Auto-Dedup Sweep** — ADVANCED_OPTIMIZATION_offline_nightly_dedup, CONCEPT_dbscan [EXTRACTED 1.00]
- **Phase 4: Tracklet Tracking** — ADVANCED_OPTIMIZATION_tracklet_based_identity_resolution, CONCEPT_bytetrack, MODULE_cv_pipeline [EXTRACTED 1.00]
- **Part 1: Implemented Improvements** — IMPROVEMENT_hnsw_ef_search_tuning, IMPROVEMENT_per_person_arcface_fallback_gating, IMPROVEMENT_empty_frame_early_out, IMPROVEMENT_tracklet_fast_path [EXTRACTED 1.00]
- **Part 2: Recommended Next Steps** — IMPROVEMENT_consolidate_per_match_db_round_trips, IMPROVEMENT_masked_face_periocular_batching, IMPROVEMENT_persist_ef_search_at_role_level, IMPROVEMENT_fused_score_reranking, IMPROVEMENT_detector_input_size_auto_selection, IMPROVEMENT_model_upgrades_evaluate [EXTRACTED 1.00]
- **Backend CV/ML Dependency Stack** — CONCEPT_fastapi, CONCEPT_pgvector, CONCEPT_alembic, CONCEPT_insightface, CONCEPT_ultralytics, CONCEPT_onnxruntime, CONCEPT_imageio_ffmpeg [EXTRACTED 1.00]
- **Multi-Angle Cross-Camera Deduplication Problem** — CONCEPT_arcface, CONCEPT_osnet, MODULE_temporal_consistency, ADVANCED_OPTIMIZATION_cross_camera_body_reid_fusion, ADVANCED_OPTIMIZATION_global_topology_aware_temporal_gate [EXTRACTED 1.00]
- **Visitor 23d9b77b Image Set** — thumb_23d9b77b, face_0d2c0ab4, face_1d3ca575, face_312db595, face_521facf2 [EXTRACTED 1.00]
- **Visitor 2585fb35 Image Set** — thumb_2585fb35, face_25cff750, face_4f1868d9, face_5955a59f, face_9d463039, face_9f93b419, face_b82c2b27, face_e6c15dc8, face_ee8e89a1, face_ef557b9a [EXTRACTED 1.00]
- **Visitor 28956e92 Image Set** — thumb_28956e92, face_3b339be8 [EXTRACTED 1.00]
- **Visitor 2cce5c68 Image Set** — thumb_2cce5c68, face_aba315b9 [EXTRACTED 1.00]
- **Visitor 30e82cba Image Set** — thumb_30e82cba, face_1b609e91 [EXTRACTED 1.00]
- **Visitor Record 5e78f87a** — visitor_5e78f87a, thumbnail_5e78f87a, face_151004ac [EXTRACTED 1.00]
- **Visitor Record 6a5f15ea** — visitor_6a5f15ea, thumbnail_6a5f15ea, face_acdfd5b9 [EXTRACTED 1.00]
- **Visitor Record 6dcedb01** — visitor_6dcedb01, thumbnail_6dcedb01, face_922735d4 [EXTRACTED 1.00]
- **Visitor Record 71df3f5f** — visitor_71df3f5f, thumbnail_71df3f5f, face_8ff846b1 [EXTRACTED 1.00]
- **Visitor Record 75cd70c2** — visitor_75cd70c2, thumbnail_75cd70c2, face_e59d66ac [EXTRACTED 1.00]
- **Visitor Record 7eca5017 (multi-face)** — visitor_7eca5017, thumbnail_7eca5017, face_041bcb21, face_24c45fc0, face_40201a5e, face_71826cf2, face_9382d308, face_c1775149, face_d243d525, face_d61672e0 [EXTRACTED 1.00]
- **Visitor Record 80a60a29** — visitor_80a60a29, thumbnail_80a60a29 [EXTRACTED 1.00]
- **Restaurant Visitor Tracker Storage** — visitor_photos_root, visitor_5e78f87a, visitor_6a5f15ea, visitor_6dcedb01, visitor_71df3f5f, visitor_75cd70c2, visitor_7eca5017, visitor_80a60a29 [INFERRED 0.95]
- **Visitor 93ddc0e9 Face Crop Set** — visitor_93ddc0e9, face_4e587999, face_681b84e6, face_745c3e2d, face_7b1769c9, face_c7baddbb, face_d05ecd65, face_d4f530f5, face_d6e59b56, face_dfd73107 [EXTRACTED 1.00]
- **Visitor 9ebf00c2 Face Crop Set** — visitor_9ebf00c2, face_153ce3cb, face_1547db8d, face_159f54da, face_211a72e8, face_41817feb, face_83c80a06 [EXTRACTED 1.00]
- **Visitor 82c8b743 Face Crop Set** — visitor_82c8b743, face_3c393903 [EXTRACTED 1.00]
- **Visitor 80a60a29 Face Crop Set** — visitor_80a60a29, face_2b02c137 [EXTRACTED 1.00]
- **Thumbnail-Face Association Group** — thumbnail_82c8b743, face_3c393903, thumbnail_93ddc0e9, face_d4f530f5, thumbnail_9ebf00c2, face_83c80a06 [INFERRED 0.85]
- **Face crops of visitor 9ebf00c2** — visitor_9ebf00c2, face_b25eb548, face_d1433496, face_f4b51cdc, face_f8324e49 [EXTRACTED 1.00]
- **Assets of visitor a0b171a0 (thumbnail + 6 face crops)** — visitor_a0b171a0, thumbnail_a0b171a0, face_1a3ddcc6, face_59c6adec, face_5c52d881, face_c952aa61, face_e4c6cfe2, face_e5d1e8fe [EXTRACTED 1.00]
- **Assets of visitor a137a9b7 (thumbnail + 2 face crops)** — visitor_a137a9b7, thumbnail_a137a9b7, face_175ecdc4, face_583e1f5c [EXTRACTED 1.00]
- **Assets of visitor a59df451 (thumbnail + 1 face crop)** — visitor_a59df451, thumbnail_a59df451, face_2cc848dc [EXTRACTED 1.00]
- **Assets of visitor adab3bd6 (thumbnail + 1 face crop)** — visitor_adab3bd6, thumbnail_adab3bd6, face_8605f513 [EXTRACTED 1.00]
- **Assets of visitor b23a1d59 (thumbnail + 1 face crop)** — visitor_b23a1d59, thumbnail_b23a1d59, face_3d2be4ff [EXTRACTED 1.00]
- **Restaurant visitor tracking photo storage** — storage_visitor_photos, visitor_9ebf00c2, visitor_a0b171a0, visitor_a137a9b7, visitor_a59df451, visitor_adab3bd6, visitor_b23a1d59 [INFERRED 0.95]
- **Visitor d40786dc with 3 face crops** — visitor_d40786dc, face_04e53627, face_353e15a6, face_48c74e29, thumb_d40786dc [EXTRACTED 1.00]
- **Visitor d19343ef with 2 face crops** — visitor_d19343ef, face_7805560b, face_abd9a807, thumb_d19343ef [EXTRACTED 1.00]
- **Visitor Photos Directory Structure (thumbnail + faces/)** — visitor_photos_dir, visitor_b838dfa6, visitor_ba64c5df, visitor_bcb7e754, visitor_c5b01d96, visitor_cbef84fb, visitor_d19343ef, visitor_d40786dc, visitor_d78a9155, visitor_e26bf9df [EXTRACTED 1.00]
- **Visitor edc9f616 Photo Record** — visitor_edc9f616, face_b87fe9d2, face_d1403460 [EXTRACTED 1.00]
- **Visitor f0fb49ef Photo Record** — visitor_f0fb49ef, thumb_f0fb49ef, face_910b687c [EXTRACTED 1.00]
- **Visitor fc2e179d Photo Record** — visitor_fc2e179d, thumb_fc2e179d, face_82773ed9 [EXTRACTED 1.00]
- **Restaurant Visitor Photo Storage System** — visitor_photos_dir, visitor_edc9f616, visitor_f0fb49ef, visitor_fc2e179d, thumb_f0fb49ef, thumb_fc2e179d, face_b87fe9d2, face_d1403460, face_910b687c, face_82773ed9 [INFERRED 0.95]

## Communities (88 total, 71 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (34): ArcFace Face Recognition, OSNet Body Re-Identification, CPU-Only Inference, CameraService, Async Database Engine, DetectedPerson, FaceEmbeddingCache, Face Quality Gating (+26 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (31): Face Crop 11fa4deb, Face Crop 2836135f, Face Crop 3173ebe2, Face Crop 4e98f23a, Face Crop 7805560b, Face Crop 82773ed9-1948-41b6-84f6-5fa8fd1d4a42, Face Crop 910b687c-b4f1-49d1-9656-16f0d61f79af, Face Crop abd9a807 (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (22): Face crop 151004ac-b626-44ad-9f0e-36fd90c1f301, Face Crop 2b02c137-ecc7-410f-8480-29b9569b30fc, Face Crop 3c393903-6ef6-4e01-be3a-e1f8c9b269eb, Face crop 8ff846b1-1a14-4596-8a30-ce7a794ed767, Face crop 922735d4-6c2e-4eb6-9edd-e388555c8e14, Face crop acdfd5b9-a367-4e15-a37d-315aab73fad5, Face crop e59d66ac-56ec-4683-ae72-97bae8530469, Thumbnail 5e78f87a (+14 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (20): Face Crop 153ce3cb-b211-424b-89cd-e301e5ce9574, Face Crop 1547db8d-c3b0-41bc-a985-585ba0e21211, Face Crop 159f54da-bb8f-4950-b55a-b48609db7a48, Face crop 1a3ddcc6, Face Crop 211a72e8-d41f-4701-94a2-a6ab07627f19, Face Crop 41817feb-d940-4b9f-8a17-eaa617918421, Face crop 59c6adec, Face crop 5c52d881 (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (19): ActiveVisit, Adaptive Centroid Learning, DetectionEvent (ORM Model), Multi-Pose Face Gallery, HNSW Vector Indexes, Visit (ORM Model), VisitTracker, Visit Session Tracking (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (18): Advanced Optimization & Deduplication Plan (Multi-Angle Focus), Cross-Camera Body Re-ID Fusion (Session Linking), Dynamic Pose-Adaptive Thresholds, Offline / Nightly Global Deduplication, Tracklet-Based Identity Resolution, ArcFace Face Embeddings, ByteTrack Tracker, DBSCAN Clustering (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (14): Backend Python Requirements, Alembic Migrations, FastAPI Web Framework, HNSW Vector Index (pgvector), imageio-ffmpeg (bundled FFmpeg 7.x), InsightFace, ONNX Runtime, pgvector Extension (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (14): Face crop 175ecdc4, Face crop 2cc848dc, Face crop 3d2be4ff, Face crop 583e1f5c, Face crop 8605f513, Visitor Photos Storage Directory, Thumbnail a137a9b7, Thumbnail a59df451 (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.35
Nodes (11): Face Crop 25cff750, Face Crop 4f1868d9, Face Crop 5955a59f, Face Crop 9d463039, Face Crop 9f93b419, Face Crop b82c2b27, Face Crop e6c15dc8, Face Crop ee8e89a1 (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.20
Nodes (11): Face Crop 4e587999-b39a-4c23-91dc-aec63dcbe054, Face Crop 681b84e6-78ad-4637-9bc2-1d3bc948c962, Face Crop 745c3e2d-75a7-409f-9b94-786f037b1f65, Face Crop 7b1769c9-937f-4289-a1a8-528c333d2664, Face Crop c7baddbb-7dd4-4cbd-8148-5c54338a1704, Face Crop d05ecd65-8c08-4e67-a41f-a1fb22ee1ec9, Face Crop d4f530f5-df42-4a92-a314-502f02d448a7, Face Crop d6e59b56-b6a7-4eb2-a91c-00bb1f9cb716 (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.38
Nodes (10): Face crop 041bcb21-e582-4e7a-83c7-0f95723480c0, Face crop 24c45fc0-dbb2-4abf-850b-466b7f4b54b6, Face crop 40201a5e-dcb0-4779-beb3-2f0b24c74bd3, Face crop 71826cf2-9142-4748-8093-597049659669, Face crop 9382d308-b62e-4449-9b61-b4ea10f6532d, Face crop c1775149-7eb4-4b45-a5ad-6bd2b79ef8a2, Face crop d243d525-54bc-4df5-a44f-c29d5bcae423, Face crop d61672e0-f72d-49da-9d97-0a21c018fc67 (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (9): Face Crop 1b609e91, Face Crop 3b339be8, Face Crop aba315b9, Visitor 28956e92 Thumbnail, Visitor 2cce5c68 Thumbnail, Visitor 30e82cba Thumbnail, Visitor 28956e92-aaab-48fe-9552-f086fffe6b28, Visitor 2cce5c68-4a71-4356-987d-f46b7d878b35 (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.60
Nodes (6): Face Crop 0d2c0ab4, Face Crop 1d3ca575, Face Crop 312db595, Face Crop 521facf2, Visitor 23d9b77b Thumbnail, Visitor 23d9b77b-5a28-4107-9214-f1d216b9df45

### Community 13 - "Community 13"
Cohesion: 0.60
Nodes (5): Upgrade Feature Extractors (Future-Proofing), AdaFace Pose-Invariant Face Recognition, BoT-SORT Tracker, StrongSORT Tracker, Model Upgrades (Evaluate, Don't Rush)

### Community 14 - "Community 14"
Cohesion: 0.70
Nodes (5): Face Crop 04e53627, Face Crop 353e15a6, Face Crop 48c74e29, Visitor Thumbnail d40786dc, Visitor d40786dc

### Community 15 - "Community 15"
Cohesion: 0.50
Nodes (4): Restaurant Tracker Dashboard, Backend Service, Dashboard Service, Restaurant Visitor Tracker

### Community 16 - "Community 16"
Cohesion: 1.00
Nodes (3): Face Crop e2e5a891, Visitor Thumbnail bcb7e754, Visitor bcb7e754

## Ambiguous Edges - Review These
- `Face crop 041bcb21-e582-4e7a-83c7-0f95723480c0` → `Face crop d61672e0-f72d-49da-9d97-0a21c018fc67`  [AMBIGUOUS]
  backend/storage/visitor_photos/7eca5017-112f-45c7-a132-1acf7c7ddaff · relation: semantically_similar_to
- `Visitor 93ddc0e9-45ab-4d95-94f2-4f60b94dff34` → `Visitor 9ebf00c2-24eb-469d-870c-058d9a2d3454`  [AMBIGUOUS]
  backend/storage/visitor_photos/ · relation: conceptually_related_to
- `Visitor 9ebf00c2-24eb-469d-870c-058d9a2d3454` → `Thumbnail a0b171a0`  [AMBIGUOUS]
  backend/storage/visitor_photos/9ebf00c2-24eb-469d-870c-058d9a2d3454 · relation: conceptually_related_to

## Knowledge Gaps
- **145 isolated node(s):** `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (+140 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **71 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Face crop 041bcb21-e582-4e7a-83c7-0f95723480c0` and `Face crop d61672e0-f72d-49da-9d97-0a21c018fc67`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Visitor 93ddc0e9-45ab-4d95-94f2-4f60b94dff34` and `Visitor 9ebf00c2-24eb-469d-870c-058d9a2d3454`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Visitor 9ebf00c2-24eb-469d-870c-058d9a2d3454` and `Thumbnail a0b171a0`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Visitor 7eca5017-112f-45c7-a132-1acf7c7ddaff` connect `Community 10` to `Community 2`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `VisitTracker` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Visitor 2585fb35-2d25-4933-a49b-411a5763a9dc` (e.g. with `Visitor 23d9b77b-5a28-4107-9214-f1d216b9df45` and `Visitor 28956e92-aaab-48fe-9552-f086fffe6b28`) actually correct?**
  _`Visitor 2585fb35-2d25-4933-a49b-411a5763a9dc` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Visitor (ORM Model)` (e.g. with `Adaptive Centroid Learning` and `HNSW Vector Indexes`) actually correct?**
  _`Visitor (ORM Model)` has 2 INFERRED edges - model-reasoned connections that need verification._