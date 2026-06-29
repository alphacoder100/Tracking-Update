"""
Reporting — render benchmark results to a console table and persist JSON / CSV /
Markdown under storage/benchmarks/ (timestamped). No external table dependency.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence


def _fmt(v) -> str:
    if isinstance(v, float):
        return f"{v:.4f}" if abs(v) < 1000 else f"{v:.1f}"
    if isinstance(v, dict):
        return " ".join(f"{k}={val:.3f}" for k, val in v.items())
    return "" if v is None else str(v)


def render_table(rows: List[dict], columns: Sequence[str], title: str = "") -> str:
    """Build a fixed-width text table from selected columns of `rows`."""
    headers = list(columns)
    table = [[_fmt(r.get(c)) for c in headers] for r in rows]
    widths = [
        max(len(headers[i]), *(len(row[i]) for row in table)) if table else len(headers[i])
        for i in range(len(headers))
    ]
    sep = "  "
    lines = []
    if title:
        lines.append(title)
    lines.append(sep.join(h.ljust(widths[i]) for i, h in enumerate(headers)))
    lines.append(sep.join("-" * widths[i] for i in range(len(headers))))
    for row in table:
        lines.append(sep.join(row[i].ljust(widths[i]) for i in range(len(headers))))
    return "\n".join(lines)


def _flatten(rows: List[dict]) -> List[dict]:
    """Expand nested dicts (e.g. tar_at_far) into flat columns for CSV/MD."""
    out = []
    for r in rows:
        flat = {}
        for k, v in r.items():
            if isinstance(v, dict):
                for sk, sv in v.items():
                    flat[f"{k}.{sk}"] = sv
            else:
                flat[k] = v
        out.append(flat)
    return out


def _markdown_table(rows: List[dict], columns: Sequence[str]) -> str:
    cols = list(columns)
    head = "| " + " | ".join(cols) + " |"
    rule = "| " + " | ".join("---" for _ in cols) + " |"
    body = [
        "| " + " | ".join(_fmt(r.get(c)) for c in cols) + " |"
        for r in rows
    ]
    return "\n".join([head, rule, *body])


def save_results(
    kind: str,
    rows: List[dict],
    columns: Sequence[str],
    meta: Dict,
    out_dir: Path,
) -> Dict[str, Path]:
    """Write JSON + CSV + Markdown report files; return the written paths."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base = out_dir / f"{kind}-{stamp}"

    payload = {"kind": kind, "generated_at": stamp, "meta": meta, "results": rows}
    json_path = base.with_suffix(".json")
    json_path.write_text(json.dumps(payload, indent=2, default=str))

    flat = _flatten(rows)
    csv_path = base.with_suffix(".csv")
    if flat:
        fieldnames = sorted({k for r in flat for k in r})
        with csv_path.open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(flat)

    md_path = base.with_suffix(".md")
    md = [
        f"# {kind.capitalize()} model benchmark",
        "",
        f"_Generated {stamp} UTC_",
        "",
        "**Run config:** " + ", ".join(f"`{k}={v}`" for k, v in meta.items()),
        "",
        _markdown_table(rows, columns),
        "",
    ]
    md_path.write_text("\n".join(md))

    return {"json": json_path, "csv": csv_path, "markdown": md_path}
