# Model benchmark harness

Compare candidate **detection** and **recognition** models on *your own data* and
pick the best one from numbers (accuracy + latency), instead of swapping models
live and eyeballing the result.

It loads models directly and reads images off disk — **no database, no running
server, no `.env` required**, so it is safe to run alongside production.

Run everything from the `backend/` directory with the project venv (Python 3.12):

```bash
./venv/Scripts/python.exe -m benchmark recognition --help
./venv/Scripts/python.exe -m benchmark detection  --help
```

Results print as a table and are saved (timestamped) to `storage/benchmarks/` as
`.json`, `.csv`, and `.md`.

---

## 1. Recognition benchmark (face re-ID)

Compares recognition models — InsightFace packs or AdaFace — the model behind
`INSIGHTFACE_MODEL_NAME` in [`app/config.py`](../app/config.py). It embeds every
image, builds same-person ("genuine") and different-person ("impostor") pairs,
and reports how well each model separates them.

### Available models

| Model | Source | Accuracy (EER) | Speed | Use case |
|-------|--------|---|---|---|
| `buffalo_l` | InsightFace | ~2.3% | 50 ms/face | Baseline, moderate accuracy |
| `buffalo_s` | InsightFace | ~4.1% | 20 ms/face (fastest) | Speed-critical (>5 FPS) |
| `buffalo_m` | InsightFace | ~3.0% | ~35 ms/face | Balance speed/accuracy |
| `adaface` | NAVER Research | **~1.9%** (best) | 100 ms/face | Best accuracy, handles poor lighting/angles |
| `antelopev2` | InsightFace | ~2.8% | 40 ms/face | Good accuracy |

```bash
# Default: compare buffalo_l vs buffalo_s on the system's own saved face crops.
./venv/Scripts/python.exe -m benchmark recognition

# Include AdaFace for comparison (may need transformers installed).
./venv/Scripts/python.exe -m benchmark recognition \
    --models buffalo_l,buffalo_s,adaface --device cpu

# Quick script (Linux/Mac):
./run_model_comparison.sh buffalo_l,buffalo_s,adaface --align resize

# Quick script (Windows PowerShell):
.\run_model_comparison.ps1 -Models "buffalo_l,buffalo_s,adaface" -Align resize
```

### Dataset layout (`--data`)

A **folder-per-identity** tree — each sub-folder is one person, every image below
it is a sample of that person:

```
root/
  alice/   a1.jpg a2.jpg ...
  bob/     b1.jpg faces/b2.jpg ...
```

The default `storage/visitor_photos/<visitor-uuid>/...` already matches this, so
it works with zero prep. It is also the standard **LFW** layout, so you can point
`--data` at any external labelled set for an unbiased score.

> ⚠️ **Bias caveat for `storage/visitor_photos`:** those identities were grouped
> by the *current* recognition model, so it is scored against labels it helped
> create — great for a relative A/B and for threshold tuning, optimistic as an
> absolute number. For an unbiased absolute score use a hand-verified or external
> dataset (e.g. LFW). The harness prints this reminder at load time.

### Alignment mode (`--align`)

| Mode | What it does | Use it for |
|------|--------------|-----------|
| `resize` (default) | Resize each crop to 112×112 and embed directly (no detection). Identical preprocessing for every model, 100% coverage. | A **fair relative A/B** of recognition models, and fast runs. |
| `detect` | Full detect → align → embed per image (crops are padded + upscaled to help the detector). | **Production-realistic** absolute numbers; coverage may be < 100% and is reported. |

Because the saved crops are tight and *un-aligned*, `resize` mode gives lower
absolute similarities/thresholds than production — fine for choosing between
models, but use `--align detect` when you want a realistic
`RETURNING_FACE_THRESHOLD`.

### Metrics

- **AUC** — overall genuine-vs-impostor separability (higher is better). The
  primary "which model is better" number.
- **EER** — equal-error rate, where false-accept = false-reject (lower is better).
- **TAR@FAR** — true-accept rate at fixed false-accept rates (1e-3 / 1e-2 / 1e-1).
  "How many returning visitors do we catch if we only tolerate 1% strangers
  wrongly matched."
- **balanced_acc / best_threshold** — best (TPR+TNR)/2 and the cosine cut-point
  that achieves it. `best_threshold` (and `eer_threshold`) are directly usable
  values for `RETURNING_FACE_THRESHOLD`.
- **d_prime** — distribution separation (higher is better).
- **embed_ms_mean / embed_fps** — per-face latency and throughput.

---

## 2. Detection benchmark (person detection)

Compares Ultralytics YOLO weights — the model behind `YOLO_MODEL_PATH`. Needs a
folder of frames (`--images`); ground-truth labels are optional.

```bash
# With ground-truth labels (sibling labels/ dir auto-detected) → absolute metrics.
./venv/Scripts/python.exe -m benchmark detection \
    --images data/frames --models yolov8n.pt,yolov8s.pt,yolo11n.pt --device cuda

# Without labels → each model is scored against the heaviest one (consensus).
./venv/Scripts/python.exe -m benchmark detection --images data/frames
```

### Ground-truth labels (optional, `--labels`)

YOLO format — one `.txt` per image sharing its stem, in a sibling `labels/` dir
(or pass `--labels`). Person class is COCO id `0` (override with `--person-class`):

```
data/frames/frame_007.jpg
data/frames/labels/frame_007.txt      # lines: "0 cx cy w h" (normalised)
```

### Metrics

- **ms_mean / fps** — latency and throughput per image (the speed trade-off).
- **detections / mean_conf** — boxes found and their mean confidence.
- **precision / recall / f1 / ap50** — accuracy at IoU ≥ 0.5. Absolute when labels
  are present; otherwise measured against the `--reference` model (default: the
  last/heaviest weight in `--models`).

---

## Applying a result

The recognition recommendation maps onto live, hot-reloadable settings. For
example, to adopt a recommended returning threshold without a restart:

```bash
curl -X PATCH http://localhost:8000/api/admin/settings \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"updates": {"RETURNING_FACE_THRESHOLD": 0.55}}'
```

Swapping the **recognition** model itself (`INSIGHTFACE_MODEL_NAME`) changes the
embedding space and **invalidates the existing face gallery** — every stored
vector must be re-enrolled. Swapping the **YOLO detector** has no such effect.
Validate here first, then change the model in config and rebuild the gallery as
needed.
