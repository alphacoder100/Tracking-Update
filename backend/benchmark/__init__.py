"""
Model benchmark harness — compare candidate detection / recognition models on
your own data and pick the best one objectively (accuracy + latency), instead of
swapping models live and guessing.

Two independent benchmarks:

  • recognition — compare face-recognition models (InsightFace packs such as
    buffalo_l / buffalo_s / antelopev2). Builds genuine/impostor face pairs from a
    folder-per-identity dataset, then reports EER, TAR@FAR, AUC, best-accuracy
    threshold (a directly usable RETURNING_FACE_THRESHOLD recommendation) and
    embedding latency. Works out-of-the-box on storage/visitor_photos/.

  • detection — compare person-detection models (Ultralytics YOLO weights). Reports
    latency / FPS and, against ground-truth labels, precision / recall / AP@0.5;
    without labels it scores each model against the heaviest one (consensus).

Run it:  python -m benchmark recognition --help
         python -m benchmark detection  --help

Nothing here touches the database or the running server — it loads models
directly and reads images off disk, so it is safe to run alongside production.
"""

__all__ = ["__version__"]
__version__ = "1.0.0"
