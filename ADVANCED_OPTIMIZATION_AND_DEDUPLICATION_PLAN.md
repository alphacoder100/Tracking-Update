# Advanced Face-Only Optimization & Deduplication Plan

**Date:** 2026-06-26  
**Objective:** Keep the visitor tracker face-first, simpler, faster, and safer by
removing body Re-ID and strengthening the existing face, pose, tracklet, topology,
and review workflows.

---

## 1. Core Problem: Duplicate Visitors From Weak Face Evidence

The main failure mode remains: the same person can be registered as a new visitor
when the first available face is blurry, masked, angled, or partially occluded.
The replacement strategy is not to add another identity model, but to avoid
making permanent identity decisions from weak evidence.

Current safeguards to preserve:

1. **Grey-zone hold:** uncertain face scores are audited, not registered.
2. **Ambiguity gate:** close matches to two different visitors are skipped.
3. **Registration pose gate:** new visitors should be seeded from frontal faces.
4. **Tracklet buffering:** wait for a short sequence instead of trusting one bad frame.
5. **Pose-aware gallery:** store diverse face angles per visitor.
6. **Review queue:** uncertain duplicates go to operator review before merge.

---

## 2. Face-Only Cross-Camera Deduplication

Cross-camera support should use face similarity plus camera topology and timing:

- If a new face appears on Camera B shortly after a known visitor was seen on
  Camera A, search recent face gallery candidates from other cameras.
- If similarity is high and the camera transition is physically plausible, attach
  live to the known visitor.
- If similarity is medium, create/hold according to the normal gates and flag a
  probable duplicate for review.
- Never use appearance/clothing as durable identity.

---

## 3. Performance Optimizations

### A. Body Re-ID Removal

Body embedding extraction has been removed. This reduces startup complexity,
avoids model-weight download failures, removes a per-frame embedding pass, and
eliminates a misleading identity signal.

### B. Gallery DB Round-Trip Consolidation

`auto_enroller.update_after_match` should fetch the visitor gallery once per match
and reuse that data for diversity checks, gallery eviction, and adaptive threshold
recompute. This keeps the hot path face-only and lowers DB pressure.

### C. Detector Input-Size Auto-Selection

`INSIGHTFACE_DET_SIZE=640` gives strong small-face recall but is slower. A warmup
window can measure median face size and choose 320, 480, or 640 per deployment.

### D. Masked-Face Batching

Masked/periocular extraction should be batched across all masked faces in a frame
instead of running one extra face pass per detection.

---

## 4. Implementation Phases

1. **Phase 1: Face-only cleanup**
   - Remove body Re-ID model loading, config, database columns, API fields, and UI types.
   - Keep historical migrations, then add a new head migration that drops body data.

2. **Phase 2: Hot-path efficiency**
   - Reuse gallery reads in the enroller.
   - Add timing metrics for inference, post-processing, DB update, and encode.

3. **Phase 3: Accuracy hardening**
   - Improve cross-camera face/topology scoring.
   - Expand duplicate review reporting.
   - Calibrate thresholds from `detection_events`.

4. **Phase 4: Evaluation only**
   - Evaluate newer face models such as AdaFace only after measurement shows
     ArcFace is the limiting factor.
   - Do not reintroduce body embeddings as a long-term visitor identity signal.
