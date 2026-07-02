"""
Video-driven model benchmark.

Given an uploaded video (no labels), this:

  1. Samples frames at a fixed stride (capped).
  2. Detects + tracks faces ONCE with a fixed detector (buffalo_l) so every
     recognition model embeds the SAME aligned crops and the SAME tracks — a fair
     A/B that isolates the recognition net.
  3. For each DETECTION model (YOLO) × device: measures latency / FPS / person
     boxes / mean confidence + CPU/RAM/GPU/VRAM cost.
  4. For each RECOGNITION model × device: embeds the shared crops, then scores
     SELF-CONSISTENCY (no labels needed):
       • intra_sim  — mean within-track cosine similarity (same person → ↑ better)
       • inter_sim  — mean cross-track cosine similarity   (diff people → ↓ better)
       • margin     — intra_sim − inter_sim                (discrimination, ↑ better)
       • dup_rate   — fraction of different-track pairs above a merge threshold
                      (would be falsely merged → ↓ better)
     plus latency / FPS + resource cost.

The result is a single report with two tables (detection, recognition), each row a
model×device combo, saved to storage/benchmarks/video-*.json.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from .common import Timer, l2_normalize, onnx_providers
from .resources import ResourceSampler, cpu_name, gpu_name, system_info


# ── Frame sampling ───────────────────────────────────────────


@dataclass
class VideoFrames:
    frames: List[np.ndarray]
    stride: int
    total_frames: int
    fps: float
    width: int
    height: int

    @property
    def duration_s(self) -> float:
        return self.total_frames / self.fps if self.fps else 0.0


def sample_frames(video_path: str, max_frames: int = 150, target_samples: int = 150) -> VideoFrames:
    """Read up to `max_frames` evenly-strided frames from the video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    fps = float(cap.get(cv2.CAP_PROP_FPS)) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    stride = max(1, total // target_samples) if total > 0 else 1
    frames: List[np.ndarray] = []
    idx = 0
    while len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % stride == 0:
            frames.append(frame)
        idx += 1
    cap.release()
    if not frames:
        raise RuntimeError("No frames could be read from the video.")
    return VideoFrames(
        frames=frames, stride=stride, total_frames=total or idx,
        fps=fps or 25.0, width=width, height=height,
    )


# ── Shared face detection + tracking (done once) ─────────────


@dataclass
class FaceInstance:
    frame_idx: int
    track_id: int
    bbox: Tuple[int, int, int, int]
    aligned: np.ndarray  # 112×112 BGR aligned crop


def _iou(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / float(area_a + area_b - inter)


def detect_and_track(
    frames: List[np.ndarray],
    device: str,
    iou_thresh: float = 0.3,
    max_gap: int = 8,
) -> List[FaceInstance]:
    """
    Detect faces in every frame with buffalo_l and link them into tracks with a
    light IoU tracker. Returns one FaceInstance per detected face (with its
    aligned crop + assigned track id).
    """
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    app = FaceAnalysis(
        name="buffalo_l",
        providers=onnx_providers(device),
        allowed_modules=["detection"],
    )
    app.prepare(ctx_id=0 if device == "cuda" else -1, det_size=(640, 640))

    # active tracks: track_id -> (last_bbox, last_frame_idx)
    active: Dict[int, Tuple[Tuple[int, int, int, int], int]] = {}
    next_id = 0
    instances: List[FaceInstance] = []

    for fidx, frame in enumerate(frames):
        faces = app.get(frame)
        for face in faces:
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            bbox = (x1, y1, x2, y2)
            # Match to the best active track within the frame gap.
            best_id, best_iou = -1, iou_thresh
            for tid, (tbbox, tfidx) in active.items():
                if fidx - tfidx > max_gap:
                    continue
                ov = _iou(bbox, tbbox)
                if ov >= best_iou:
                    best_id, best_iou = tid, ov
            if best_id < 0:
                best_id = next_id
                next_id += 1
            active[best_id] = (bbox, fidx)

            kps = getattr(face, "kps", None)
            if kps is None:
                continue
            aligned = face_align.norm_crop(frame, landmark=kps, image_size=112)
            instances.append(FaceInstance(fidx, best_id, bbox, aligned))

    return instances


# ── Detection (YOLO) benchmark ───────────────────────────────


def _rt_factor(model_fps: float, required_fps: float) -> Optional[float]:
    """How many times real-time a stage runs: its throughput ÷ what the source
    demands (≥1.0 keeps up). None when the demand is unknown (no source fps)."""
    if not required_fps:
        return None
    return round(model_fps / required_fps, 2)


def benchmark_detection(
    weights: List[str],
    frames: List[np.ndarray],
    device: str,
    video_fps: float,
    conf: float = 0.25,
    imgsz: int = 640,
) -> List[dict]:
    """Run each YOLO weight over the frames; record load/latency/speed + cost +
    real-time factor (throughput vs the source video's own fps)."""
    from ultralytics import YOLO

    rows: List[dict] = []
    track_gpu = device == "cuda"
    for w in weights:
        print(f"\n▶ detection {w} on {device}")
        load_t = Timer()
        try:
            with load_t.measure():
                model = YOLO(w)
                # Warmup (cold-start cost is part of load, not steady-state latency).
                model.predict(frames[0], verbose=False, conf=conf, classes=[0],
                              imgsz=imgsz, device=device)
        except Exception as exc:
            print(f"  [error] {w}: {exc}")
            rows.append({"model": w, "device": device, "error": str(exc)})
            continue

        timer = Timer()
        n_det = 0
        conf_sum = 0.0
        with ResourceSampler(track_gpu=track_gpu) as sampler:
            for frame in frames:
                with timer.measure():
                    res = model.predict(frame, verbose=False, conf=conf,
                                        classes=[0], imgsz=imgsz, device=device)
                for r in res:
                    if r.boxes is not None and len(r.boxes) > 0:
                        n_det += len(r.boxes)
                        conf_sum += float(r.boxes.conf.cpu().numpy().sum())
        rt = _rt_factor(timer.fps, video_fps)
        rows.append({
            "model": w,
            "device": device,
            "frames": len(frames),
            "detections": n_det,
            "det_per_frame": round(n_det / len(frames), 2),
            "mean_conf": round(conf_sum / n_det, 3) if n_det else 0.0,
            "ms_mean": round(timer.mean_ms, 2),
            "fps": round(timer.fps, 1),
            "load_ms": round(load_t.mean_ms, 1),
            "rt_factor": rt,
            "realtime": rt is not None and rt >= 1.0,
            **timer.latency_stats(),
            **sampler.stats.as_dict(),
        })
        print(f"  {n_det} boxes · {timer.mean_ms:.1f} ms/frame · {timer.fps:.1f} FPS")
    return rows


# ── Recognition benchmark (self-consistency) ─────────────────


def _self_consistency(
    embeddings: np.ndarray,
    track_ids: np.ndarray,
    dup_threshold: float = 0.5,
    max_pairs: int = 50_000,
    seed: int = 42,
) -> dict:
    """Compute intra/inter-track similarity, margin and duplicate rate."""
    rng = np.random.default_rng(seed)
    by_track: Dict[int, List[int]] = {}
    for i, t in enumerate(track_ids):
        by_track.setdefault(int(t), []).append(i)

    multi = {t: idxs for t, idxs in by_track.items() if len(idxs) >= 2}

    # Intra-track (genuine) similarities.
    intra: List[float] = []
    for idxs in multi.values():
        pairs = list(itertools.combinations(idxs, 2))
        if len(pairs) > 200:
            pairs = [pairs[k] for k in rng.choice(len(pairs), 200, replace=False)]
        for i, j in pairs:
            intra.append(float(embeddings[i] @ embeddings[j]))

    # Inter-track (impostor) similarities — sample cross-track pairs.
    track_list = list(by_track.keys())
    inter: List[float] = []
    if len(track_list) >= 2:
        reps = {t: idxs for t, idxs in by_track.items()}
        attempts = 0
        target = min(max_pairs, 20_000)
        while len(inter) < target and attempts < target * 3:
            attempts += 1
            ta, tb = rng.choice(len(track_list), 2, replace=False)
            ta, tb = track_list[ta], track_list[tb]
            ia = reps[ta][rng.integers(len(reps[ta]))]
            ib = reps[tb][rng.integers(len(reps[tb]))]
            inter.append(float(embeddings[ia] @ embeddings[ib]))

    intra_arr = np.array(intra) if intra else np.array([0.0])
    inter_arr = np.array(inter) if inter else np.array([0.0])
    intra_sim = float(intra_arr.mean())
    inter_sim = float(inter_arr.mean())
    dup_rate = float((inter_arr > dup_threshold).mean()) if inter else 0.0

    return {
        "tracks": len(by_track),
        "tracks_multi": len(multi),
        "intra_sim": round(intra_sim, 4),
        "inter_sim": round(inter_sim, 4),
        "margin": round(intra_sim - inter_sim, 4),
        "dup_rate": round(dup_rate, 4),
        "genuine_pairs": len(intra),
        "impostor_pairs": len(inter),
    }


def benchmark_recognition(
    model_names: List[str],
    instances: List[FaceInstance],
    device: str,
    video_fps: float,
    n_frames: int,
) -> List[dict]:
    """Embed the shared aligned crops with each model; score self-consistency +
    load/latency + a real-time factor. Recognition's real-time demand is the face
    rate the footage produces: (faces ÷ frames) × video_fps embeddings per second."""
    from .recognition import _load_recognition_model

    if not instances:
        return [{"model": m, "device": device, "error": "no faces detected"} for m in model_names]

    crops = [inst.aligned for inst in instances]
    track_ids = np.array([inst.track_id for inst in instances])
    track_gpu = device == "cuda"
    faces_per_frame = (len(crops) / n_frames) if n_frames else 0.0
    required_face_fps = faces_per_frame * video_fps

    rows: List[dict] = []
    for name in model_names:
        print(f"\n▶ recognition {name} on {device}")
        load_t = Timer()
        try:
            with load_t.measure():
                model = _load_recognition_model(name, device)
        except Exception as exc:
            print(f"  [error] {name}: {exc}")
            rows.append({"model": name, "device": device, "error": str(exc)})
            continue

        timer = Timer()
        embeddings: List[np.ndarray] = []
        with ResourceSampler(track_gpu=track_gpu) as sampler:
            for crop in crops:
                with timer.measure():
                    emb = model.embed_resize(crop)
                embeddings.append(emb)
        emb_arr = l2_normalize(np.vstack(embeddings))

        consistency = _self_consistency(emb_arr, track_ids)
        rt = _rt_factor(timer.fps, required_face_fps)
        rows.append({
            "model": name,
            "device": device,
            "faces": len(crops),
            "dim": int(emb_arr.shape[1]),
            "ms_mean": round(timer.mean_ms, 2),
            "fps": round(timer.fps, 1),
            "load_ms": round(load_t.mean_ms, 1),
            "rt_factor": rt,
            "realtime": rt is not None and rt >= 1.0,
            **timer.latency_stats(),
            **consistency,
            **sampler.stats.as_dict(),
        })
        print(
            f"  margin={consistency['margin']:.3f} "
            f"(intra={consistency['intra_sim']:.3f} inter={consistency['inter_sim']:.3f}) "
            f"dup={consistency['dup_rate']*100:.1f}% · {timer.mean_ms:.1f} ms/face"
        )
    return rows


# ── Full-pipeline combo benchmark ────────────────────────────


def benchmark_pipeline(
    detection_models: List[str],
    recognition_models: List[str],
    frames: List[np.ndarray],
    device: str,
    video_fps: float,
    conf: float = 0.25,
    imgsz: int = 640,
) -> List[dict]:
    """
    End-to-end pass per (detection × recognition) pairing: for every frame, run
    person detection (YOLO) + face detection/alignment (buffalo_l) + recognition
    embedding, timed as ONE fused operation. Unlike the isolated stage tables, this
    measures the real ms/frame, FPS, real-time factor and combined CPU/GPU cost of
    running a full model pairing together.

    Models are loaded per pairing and released after, so peak memory stays at one
    pairing's worth even across a large grid. The shared face detector is loaded
    once for the whole grid.
    """
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align
    from ultralytics import YOLO

    from .recognition import _load_recognition_model

    track_gpu = device == "cuda"
    rows: List[dict] = []

    # Shared face detector (buffalo_l) — the pipeline's face stage, loaded once.
    try:
        face_app = FaceAnalysis(
            name="buffalo_l",
            providers=onnx_providers(device),
            allowed_modules=["detection"],
        )
        face_app.prepare(ctx_id=0 if device == "cuda" else -1, det_size=(640, 640))
    except Exception as exc:
        return [{"model": "pipeline", "recognition": "—", "device": device,
                 "error": f"face detector failed to load: {exc}"}]

    for dw in detection_models:
        try:
            yolo = YOLO(dw)
            yolo.predict(frames[0], verbose=False, conf=conf, classes=[0],
                         imgsz=imgsz, device=device)
        except Exception as exc:
            rows.append({"model": dw, "recognition": "—", "device": device, "error": str(exc)})
            continue

        for rw in recognition_models:
            print(f"\n▶ pipeline {dw} + {rw} on {device}")
            try:
                rec = _load_recognition_model(rw, device)
            except Exception as exc:
                print(f"  [error] {rw}: {exc}")
                rows.append({"model": dw, "recognition": rw, "device": device, "error": str(exc)})
                continue

            timer = Timer()
            n_persons = n_faces = 0
            with ResourceSampler(track_gpu=track_gpu) as sampler:
                for frame in frames:
                    with timer.measure():
                        det = yolo.predict(frame, verbose=False, conf=conf,
                                           classes=[0], imgsz=imgsz, device=device)
                        for r in det:
                            if r.boxes is not None:
                                n_persons += len(r.boxes)
                        faces = face_app.get(frame)
                        for f in faces:
                            kps = getattr(f, "kps", None)
                            if kps is None:
                                continue
                            aligned = face_align.norm_crop(frame, landmark=kps, image_size=112)
                            rec.embed_resize(aligned)
                            n_faces += 1
            rt = _rt_factor(timer.fps, video_fps)
            rows.append({
                "model": dw,
                "recognition": rw,
                "device": device,
                "frames": len(frames),
                "persons": n_persons,
                "faces": n_faces,
                "ms_mean": round(timer.mean_ms, 2),
                "fps": round(timer.fps, 1),
                "rt_factor": rt,
                "realtime": rt is not None and rt >= 1.0,
                **timer.latency_stats(),
                **sampler.stats.as_dict(),
            })
            # Release recognition model before the next pairing (bound peak memory).
            del rec
            print(
                f"  {n_persons} persons · {n_faces} faces · "
                f"{timer.mean_ms:.1f} ms/frame · {timer.fps:.1f} FPS"
            )
    return rows


# ── Orchestration ────────────────────────────────────────────


def run_video_benchmark(
    video_path: str,
    detection_models: List[str],
    recognition_models: List[str],
    devices: List[str],
    max_frames: int = 150,
    conf: float = 0.25,
    imgsz: int = 640,
    run_pipeline: bool = True,
    progress=None,
) -> dict:
    """
    Full video benchmark. `progress(msg)` is an optional callback for log lines.
    Returns the report dict (also what gets saved as JSON).
    """
    def log(msg: str) -> None:
        print(msg, flush=True)
        if progress is not None:
            progress(msg)

    log(f"Sampling frames from {Path(video_path).name} …")
    vf = sample_frames(video_path, max_frames=max_frames)
    log(
        f"{len(vf.frames)} frames sampled (stride={vf.stride}) · "
        f"{vf.width}x{vf.height} · {vf.duration_s:.1f}s @ {vf.fps:.0f}fps"
    )

    detection_rows: List[dict] = []
    recognition_rows: List[dict] = []
    pipeline_rows: List[dict] = []
    do_pipeline = run_pipeline and bool(detection_models) and bool(recognition_models)

    for device in devices:
        log(f"\n=== Device: {device.upper()} ===")

        # Detection benchmark.
        if detection_models:
            log(f"Detection models on {device}: {', '.join(detection_models)}")
            detection_rows += benchmark_detection(
                detection_models, vf.frames, device, vf.fps, conf=conf, imgsz=imgsz
            )

        # Shared detect+track (once per device — detector runs on that device).
        if recognition_models:
            log(f"Detecting + tracking faces on {device} (shared crops) …")
            instances = detect_and_track(vf.frames, device)
            n_tracks = len({i.track_id for i in instances})
            log(f"{len(instances)} faces across {n_tracks} tracks")
            recognition_rows += benchmark_recognition(
                recognition_models, instances, device, vf.fps, len(vf.frames)
            )

        # Full end-to-end pipeline (detect + face-detect + recognize) per pairing.
        if do_pipeline:
            log(f"Full-pipeline combos on {device}: "
                f"{len(detection_models)}×{len(recognition_models)} pairing(s) …")
            pipeline_rows += benchmark_pipeline(
                detection_models, recognition_models, vf.frames, device,
                vf.fps, conf=conf, imgsz=imgsz
            )

    report = {
        "kind": "video",
        "meta": {
            "video": Path(video_path).name,
            "frames_sampled": len(vf.frames),
            "frame_stride": vf.stride,
            "total_frames": vf.total_frames,
            "duration_s": round(vf.duration_s, 1),
            "resolution": f"{vf.width}x{vf.height}",
            "video_fps": round(vf.fps, 1),
            "devices": devices,
            "cpu_name": cpu_name(),
            "gpu_name": gpu_name(),
            "system": system_info(),
            "conf": conf,
            "imgsz": imgsz,
        },
        "detection": detection_rows,
        "recognition": recognition_rows,
        "pipeline": pipeline_rows,
    }
    log("\nVideo benchmark complete.")
    return report
