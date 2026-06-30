"""
CLI entry point for the model benchmark harness.

    python -m benchmark recognition [opts]
    python -m benchmark detection   [opts]

Run from the backend/ directory using the project venv:

    ./venv/Scripts/python.exe -m benchmark recognition
    ./venv/Scripts/python.exe -m benchmark detection --images path/to/frames
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .common import resolve_device
from .report import render_table, save_results

DEFAULT_PHOTO_DIR = Path("storage/visitor_photos")
DEFAULT_OUT_DIR = Path("storage/benchmarks")

# Columns shown in the console summary (subset of the full JSON/CSV).
REC_COLUMNS = [
    "model", "coverage", "identities_multi", "auc", "eer",
    "balanced_acc", "best_threshold", "eer_threshold",
    "tar_at_far", "d_prime", "embed_ms_mean", "embed_fps",
]
DET_COLUMNS = [
    "model", "detections", "mean_conf", "precision", "recall",
    "f1", "ap50", "ms_mean", "fps",
]


def _csv_list(s: str) -> list[str]:
    return [x.strip() for x in s.split(",") if x.strip()]


def cmd_recognition(args: argparse.Namespace) -> int:
    from .datasets import load_recognition_dataset
    from .recognition import run_recognition_benchmark

    device = resolve_device(args.device)
    models = _csv_list(args.models)
    print(f"Recognition benchmark · device={device} · models={models}")

    ds = load_recognition_dataset(
        Path(args.data), min_images=1, max_per_identity=args.max_per_identity
    )
    print(
        f"Dataset: {ds.n_identities} identities · {ds.n_images} images · "
        f"{ds.n_multi} identities with ≥2 images (root={ds.root})"
    )
    if str(ds.root).replace("\\", "/").endswith("visitor_photos"):
        print(
            "  [note] identities here were grouped by the CURRENT recognition model, "
            "so absolute numbers are optimistic for it. Great for relative A/B and "
            "threshold tuning; use a hand-verified/external set for an unbiased score."
        )

    rows = run_recognition_benchmark(
        model_names=models,
        dataset=ds,
        device=device,
        align=args.align,
        det_size=args.det_size,
        max_genuine=args.max_genuine,
        max_impostor=args.max_impostor,
        seed=args.seed,
    )

    print("\n" + render_table(rows, REC_COLUMNS, title="── Recognition results ──"))
    meta = {
        "device": device, "align": args.align, "data": str(ds.root),
        "identities": ds.n_identities, "images": ds.n_images,
        "max_genuine": args.max_genuine, "max_impostor": args.max_impostor,
    }
    paths = save_results("recognition", rows, REC_COLUMNS, meta, Path(args.out))
    print("\nSaved:", ", ".join(f"{k}={v}" for k, v in paths.items()))
    _print_recommendation(rows)
    return 0


def _print_recommendation(rows: list[dict]) -> None:
    scored = [r for r in rows if "auc" in r]
    if not scored:
        return
    best = max(scored, key=lambda r: r["auc"])
    print(
        f"\n➜ Best by AUC: {best['model']} "
        f"(AUC={best['auc']:.4f}, EER={best['eer']*100:.2f}%). "
        f"Suggested RETURNING_FACE_THRESHOLD ≈ {best['best_threshold']:.2f} "
        f"(balanced-accuracy) or {best['eer_threshold']:.2f} (EER). "
        f"Note: --align resize omits face alignment, so absolute thresholds run "
        f"low; use --align detect for production-realistic values."
    )


def cmd_video(args: argparse.Namespace) -> int:
    """Benchmark detection + recognition models on an uploaded video."""
    import json
    from datetime import datetime, timezone

    from .common import resolve_device
    from .video import run_video_benchmark

    det_models = _csv_list(args.detection_models) if args.detection_models else []
    rec_models = _csv_list(args.recognition_models) if args.recognition_models else []

    # Resolve requested devices, dropping cuda if unavailable (and de-duping).
    requested = _csv_list(args.devices)
    devices: list[str] = []
    for d in requested:
        rd = resolve_device(d)
        if rd not in devices:
            devices.append(rd)
    if not devices:
        devices = ["cpu"]

    print(
        f"Video benchmark · video={args.video} · devices={devices}\n"
        f"  detection={det_models or '—'}\n  recognition={rec_models or '—'}"
    )

    report = run_video_benchmark(
        video_path=args.video,
        detection_models=det_models,
        recognition_models=rec_models,
        devices=devices,
        max_frames=args.max_frames,
        conf=args.conf,
        imgsz=args.imgsz,
    )

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    report["generated_at"] = stamp
    out_path = out_dir / f"video-{stamp}.json"
    out_path.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nSaved: {out_path}")
    return 0


def cmd_detection(args: argparse.Namespace) -> int:
    from .datasets import load_detection_dataset
    from .detection import run_detection_benchmark

    device = resolve_device(args.device)
    weights = _csv_list(args.models)
    print(f"Detection benchmark · device={device} · models={weights}")

    if not args.images:
        print(
            "error: --images is required for the detection benchmark.\n"
            "Point it at a folder of frames; add YOLO-format labels in a sibling\n"
            "labels/ dir (or --labels) for absolute precision/recall/AP@0.5.",
            file=sys.stderr,
        )
        return 2

    ds = load_detection_dataset(
        Path(args.images),
        Path(args.labels) if args.labels else None,
        person_class=args.person_class,
    )
    print(f"Dataset: {len(ds)} images · labels={'yes' if ds.has_labels else 'no'}")

    rows = run_detection_benchmark(
        weights=weights,
        dataset=ds,
        device=device,
        conf=args.conf,
        imgsz=args.imgsz,
        iou_thr=args.iou,
        reference=args.reference,
    )

    print("\n" + render_table(rows, DET_COLUMNS, title="── Detection results ──"))
    meta = {
        "device": device, "images": len(ds), "labels": ds.has_labels,
        "conf": args.conf, "imgsz": args.imgsz, "iou": args.iou,
    }
    paths = save_results("detection", rows, DET_COLUMNS, meta, Path(args.out))
    print("\nSaved:", ", ".join(f"{k}={v}" for k, v in paths.items()))
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    """Push a recognition benchmark's recommendation to the live backend."""
    import httpx

    # Pick the report: an explicit --file, else the newest recognition-*.json.
    if args.file:
        report_path = Path(args.file)
    else:
        candidates = sorted(Path(args.out).glob("recognition-*.json"))
        if not candidates:
            print(
                f"error: no recognition benchmark found in {args.out}. "
                f"Run `python -m benchmark recognition` first.",
                file=sys.stderr,
            )
            return 2
        report_path = candidates[-1]

    try:
        report = json.loads(report_path.read_text())
    except Exception as exc:
        print(f"error: could not read {report_path}: {exc}", file=sys.stderr)
        return 2

    scored = [r for r in report.get("results", []) if "auc" in r]
    if not scored:
        print("error: report has no scored models.", file=sys.stderr)
        return 2
    best = max(scored, key=lambda r: r["auc"])
    thr_key = "eer_threshold" if args.threshold_metric == "eer" else "best_threshold"
    threshold = round(float(best[thr_key]), 3)
    model = str(best["model"])
    print(
        f"Report: {report_path.name}\n"
        f"Winner: {model} (AUC={best['auc']:.4f}, EER={best['eer']*100:.2f}%)\n"
        f"→ RETURNING_FACE_THRESHOLD = {threshold} (from {thr_key})"
        + (f"\n→ switch recognition model to {model}" if args.switch_model else "")
    )
    if args.dry_run:
        print("(dry-run: nothing sent)")
        return 0

    api_key = args.api_key or os.environ.get("ADMIN_API_KEY") or os.environ.get("API_KEY")
    if not api_key:
        print(
            "error: no API key. Pass --api-key or set API_KEY / ADMIN_API_KEY.",
            file=sys.stderr,
        )
        return 2
    base = args.base_url.rstrip("/")
    headers = {"x-api-key": api_key, "content-type": "application/json"}

    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.patch(
                f"{base}/api/admin/settings",
                headers=headers,
                json={"updates": {"RETURNING_FACE_THRESHOLD": threshold}},
            )
            r.raise_for_status()
            print(f"Applied threshold: {r.json().get('applied', {})}")

            if args.switch_model:
                r2 = client.post(
                    f"{base}/api/admin/models",
                    headers=headers,
                    json={"insightface_model": model, "confirm_recognition_change": True},
                )
                r2.raise_for_status()
                print(f"Switched recognition model → {model} (gallery needs re-enrollment).")
    except Exception as exc:
        print(f"error: request failed: {exc}", file=sys.stderr)
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="benchmark", description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    # ── recognition ──
    r = sub.add_parser("recognition", help="compare face-recognition models")
    r.add_argument("--models", default="buffalo_l,buffalo_s",
                   help="comma-separated InsightFace pack names (default: buffalo_l,buffalo_s)")
    r.add_argument("--data", default=str(DEFAULT_PHOTO_DIR),
                   help="folder-per-identity dataset root (default: storage/visitor_photos)")
    r.add_argument("--align", choices=["resize", "detect"], default="resize",
                   help="resize-crop (default, isolates recognition) or full detect→align→embed")
    r.add_argument("--det-size", type=int, default=640, dest="det_size")
    r.add_argument("--max-per-identity", type=int, default=None, dest="max_per_identity")
    r.add_argument("--max-genuine", type=int, default=20_000, dest="max_genuine")
    r.add_argument("--max-impostor", type=int, default=40_000, dest="max_impostor")
    r.add_argument("--device", default="auto", help="auto|cpu|cuda")
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    r.set_defaults(func=cmd_recognition)

    # ── video ──
    v = sub.add_parser("video", help="benchmark detection + recognition on an uploaded video")
    v.add_argument("--video", required=True, help="path to the uploaded video file")
    v.add_argument("--detection-models", default="yolov8n.pt,yolov8s.pt", dest="detection_models",
                   help="comma-separated YOLO weights (empty to skip detection)")
    v.add_argument("--recognition-models", default="buffalo_l,buffalo_s", dest="recognition_models",
                   help="comma-separated recognition models (empty to skip recognition)")
    v.add_argument("--devices", default="cpu", help="comma-separated devices: cpu,cuda")
    v.add_argument("--max-frames", type=int, default=150, dest="max_frames")
    v.add_argument("--conf", type=float, default=0.25)
    v.add_argument("--imgsz", type=int, default=640)
    v.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    v.set_defaults(func=cmd_video)

    # ── detection ──
    d = sub.add_parser("detection", help="compare person-detection (YOLO) models")
    d.add_argument("--models", default="yolov8n.pt,yolov8s.pt",
                   help="comma-separated YOLO weights (default: yolov8n.pt,yolov8s.pt)")
    d.add_argument("--images", default=None, help="folder of frames to evaluate (required)")
    d.add_argument("--labels", default=None, help="YOLO-format labels dir (optional)")
    d.add_argument("--reference", default=None,
                   help="model to score against when no labels (default: last in --models)")
    d.add_argument("--conf", type=float, default=0.25)
    d.add_argument("--imgsz", type=int, default=640)
    d.add_argument("--iou", type=float, default=0.5)
    d.add_argument("--person-class", type=int, default=0, dest="person_class")
    d.add_argument("--device", default="auto", help="auto|cpu|cuda")
    d.add_argument("--out", default=str(DEFAULT_OUT_DIR))
    d.set_defaults(func=cmd_detection)

    # ── apply ──
    a = sub.add_parser("apply", help="push a recognition benchmark's recommendation to the live backend")
    a.add_argument("--file", default=None, help="specific report JSON (default: newest recognition-*.json)")
    a.add_argument("--out", default=str(DEFAULT_OUT_DIR), help="dir to search for reports")
    a.add_argument("--threshold-metric", choices=["best", "eer"], default="best",
                   dest="threshold_metric", help="which recommended threshold to apply")
    a.add_argument("--switch-model", action="store_true", dest="switch_model",
                   help="also switch the recognition model to the winner (rebuilds gallery)")
    a.add_argument("--base-url", default="http://localhost:8000", dest="base_url")
    a.add_argument("--api-key", default=None, dest="api_key",
                   help="x-api-key (default: $ADMIN_API_KEY or $API_KEY)")
    a.add_argument("--dry-run", action="store_true", dest="dry_run")
    a.set_defaults(func=cmd_apply)

    return p


def main(argv: list[str] | None = None) -> int:
    # Console output uses a few Unicode glyphs (≥ · ▶ ➜); force UTF-8 so a legacy
    # Windows code page (cp1252) doesn't crash the run on an encode error.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except Exception:
            pass
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
