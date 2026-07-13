"""
Unified analysis pipeline — called by Electron as a subprocess.

Usage:
    python run_analysis.py --video PATH --predict-csv PATH --out-dir PATH

Progress lines printed to stdout are streamed to the renderer:
    STEP:N:description
    INFO:message
    DONE:path/to/analysis.json
    ERROR:message
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from csv_filter import run as filter_run
from analytics import run_analytics, estimate_speed
from shot_classifier import classify_shots
from trajectory_extractor import extract_trajectories
from court_detector import detect_court_polygon
from player_tracker import track_players


def _p(msg):
    print(msg, flush=True)


def _video_meta(path):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    return {"fps": round(fps, 2), "total_frames": total,
            "width": w, "height": h,
            "duration_sec": round(total / fps, 2)}


def _speed_histogram(df, fps):
    bins = [0, 200, 400, 600, 800, 1000, 1500, 2000, 3000]
    speeds = []
    for _, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame")
        dx = grp["x"].diff()
        dy = grp["y"].diff()
        gap = grp["frame"].diff().clip(lower=1)
        s = np.sqrt(dx ** 2 + dy ** 2) / gap * fps
        speeds.extend(s.dropna().tolist())
    counts, edges = np.histogram(speeds, bins=bins)
    return {
        "labels": [f"{int(edges[i])}-{int(edges[i+1])}" for i in range(len(counts))],
        "counts": counts.tolist(),
    }


def _shot_pattern(shots, frame_w):
    if not shots:
        return {"left_pct": 0, "center_pct": 0, "right_pct": 0,
                "left": 0, "center": 0, "right": 0}
    xs = [s["x"] for s in shots]
    left = sum(1 for x in xs if x < frame_w * 0.4)
    right = sum(1 for x in xs if x > frame_w * 0.6)
    center = len(xs) - left - right
    total = max(len(xs), 1)
    return {
        "left": left, "center": center, "right": right,
        "left_pct": round(100 * left / total, 1),
        "center_pct": round(100 * center / total, 1),
        "right_pct": round(100 * right / total, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--predict-csv", default=None)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--track-players", action="store_true", default=False)
    args = ap.parse_args()

    video = Path(args.video)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 0. TrackNetV2 detection (only if no CSV supplied) ─────────────────────
    if args.predict_csv:
        predict_csv = Path(args.predict_csv)
    else:
        _p("STEP:0:Running TrackNetV2 shuttle detection (no CSV provided)")
        _p("INFO:Importing PyTorch — first run can take 30-60s, please wait…")
        from tracknet_tracker import generate_predict_csv

        auto_csv = out_dir / "tracknet_predict.csv"

        def _tn_progress(frame_num, total):
            pct = int(100 * frame_num / max(total, 1))
            _p(f"INFO:TrackNetV2: frame {frame_num}/{total} ({pct}%)")

        generate_predict_csv(str(video), str(auto_csv), progress_fn=_tn_progress)
        predict_csv = auto_csv

    # ── 1. Video metadata ──────────────────────────────────────────────────────
    _p("STEP:1:Reading video metadata")
    meta = _video_meta(video)
    fps = meta["fps"]
    frame_w, frame_h = meta["width"], meta["height"]
    _p(f"INFO:{frame_w}x{frame_h} @ {fps}fps  {meta['duration_sec']}s total")

    # ── 2. Filter detections ───────────────────────────────────────────────────
    _p("STEP:2:Filtering shuttle detections")
    clean_df, _ = filter_run(str(predict_csv), out_dir=str(out_dir),
                             fps=fps, video_path=str(video))
    clean_csv = out_dir / "shuttle_clean.csv"

    # ── 3. Analytics (heatmap, rally stats, zones) ─────────────────────────────
    _p("STEP:3:Running analytics + generating heatmap")
    results = run_analytics(clean_csv, frame_w=frame_w, frame_h=frame_h,
                            fps=fps, out_dir=str(out_dir), video_path=str(video))

    # ── 4. Shot classification ─────────────────────────────────────────────────
    _p("STEP:4:Classifying shots (smash / clear / drop / lift / drive / net)")
    df = pd.read_csv(clean_csv)
    shots = classify_shots(df, fps=fps)
    shot_type_counts = {}
    for s in shots:
        shot_type_counts[s["type"]] = shot_type_counts.get(s["type"], 0) + 1

    # ── 5. Trajectory arcs ─────────────────────────────────────────────────────
    _p("STEP:5:Extracting trajectory arcs")
    trajectories = extract_trajectories(df)

    # ── 6. Speed histogram ─────────────────────────────────────────────────────
    _p("STEP:6:Building speed histogram")
    hist = _speed_histogram(df, fps)

    # ── 7. Court corners ───────────────────────────────────────────────────────
    _p("STEP:7:Detecting court boundary")
    polygon = detect_court_polygon(str(video))
    court_corners = polygon.tolist() if polygon is not None else None

    # ── 8. Player tracking (optional) ─────────────────────────────────────────
    player_data = None
    if args.track_players:
        _p("STEP:8:Tracking players (YOLO)")
        player_data = track_players(str(video), out_dir, polygon,
                                    frame_w=frame_w, frame_h=frame_h)
    else:
        _p("STEP:8:Skipping player tracking (pass --track-players to enable)")

    # ── 9. Build JSON ──────────────────────────────────────────────────────────
    _p("STEP:9:Compiling results")
    rstats = results["rally_stats"]
    zones = results["shot_zones"]

    rallies_list = []
    if not rstats.empty:
        for _, row in rstats.iterrows():
            rallies_list.append({
                "id": int(row["rally_id"]),
                "start_frame": int(row["start_frame"]),
                "end_frame": int(row["end_frame"]),
                "start_sec": round(row["start_frame"] / fps, 2),
                "end_sec": round(row["end_frame"] / fps, 2),
                "duration_sec": round(float(row["duration_sec"]), 2),
                "shuttle_frames": int(row["shuttle_frames"]),
                "avg_speed_px": round(float(row["avg_speed_px"]), 1),
                "max_speed_px": round(float(row["max_speed_px"]), 1),
            })

    analysis = {
        "meta": {
            "video_path": str(video),
            "predict_csv": str(predict_csv),
            "out_dir": str(out_dir),
            "analyzed_at": datetime.now().isoformat(),
            **meta,
        },
        "summary": {
            "total_rallies": len(rallies_list),
            "avg_rally_sec": round(float(rstats["duration_sec"].mean()), 2) if not rstats.empty else 0,
            "max_rally_sec": round(float(rstats["duration_sec"].max()), 2) if not rstats.empty else 0,
            "total_shots": len(shots),
            "avg_speed_px_per_sec": round(float(rstats["avg_speed_px"].mean()), 1) if not rstats.empty else 0,
            "max_speed_px_per_sec": round(float(rstats["max_speed_px"].max()), 1) if not rstats.empty else 0,
            "court_corners": court_corners,
        },
        "rallies": rallies_list,
        "shot_zones": zones,
        "shots": shots[:1000],
        "shot_type_counts": shot_type_counts,
        "trajectories": trajectories[:300],
        "speed_histogram": hist,
        "shot_pattern": _shot_pattern(shots, frame_w),
        "heatmap_path": str(out_dir / "shuttle_heatmap.png"),
        "player_data": player_data,
        "player_heatmap_path": (
            player_data["heatmap_path"] if player_data else None
        ),
    }

    out_json = out_dir / "analysis.json"
    with open(out_json, "w") as f:
        json.dump(analysis, f, indent=2, default=str)

    _p(f"DONE:{out_json}")


if __name__ == "__main__":
    main()
