"""
Filter raw TrackNet CSV output:
  - Remove invisible frames
  - Remove stuck false positives (fixed-position clusters)
  - Remove temporally isolated detections (not part of a trajectory)
  - Output clean CSV + rally segments
"""

import cv2
import pandas as pd
import numpy as np
from pathlib import Path
from collections import Counter
from court_detector import detect_court_polygon


def load_raw(csv_path):
    df = pd.read_csv(csv_path)
    df = df.rename(columns={"frame_num": "frame"})
    return df


def remove_invisible(df):
    return df[df["visible"] == 1].copy()


def remove_stuck_clusters(df, tolerance=4, min_repeat=30):
    """
    Remove any (x, y) position that repeats almost identically for >= min_repeat frames.
    These are scoreboard/net artifacts at fixed positions.
    """
    rounded = df[["x", "y"]].apply(lambda c: (c / tolerance).round() * tolerance)
    counts = Counter(zip(rounded["x"], rounded["y"]))
    bad = {pos for pos, cnt in counts.items() if cnt >= min_repeat}
    if bad:
        rx = (df["x"] / tolerance).round() * tolerance
        ry = (df["y"] / tolerance).round() * tolerance
        mask = pd.Series(list(zip(rx, ry)), index=df.index).isin(bad)
        removed = mask.sum()
        df = df[~mask].copy()
        print(f"  [filter] removed {removed} frames from {len(bad)} stuck cluster(s): {bad}")
    return df


def remove_high_frequency_x(df, threshold=50, x_tolerance=3):
    """
    Remove detections where a narrow x-band appears >= threshold times total.
    Net posts and court line edges produce a constant x with varying y — this
    catches them even when individual (x,y) pairs aren't repeated.
    """
    rounded_x = (df["x"] / x_tolerance).round() * x_tolerance
    x_counts = rounded_x.value_counts()
    bad_x = set(x_counts[x_counts >= threshold].index)
    mask = rounded_x.isin(bad_x)
    removed = mask.sum()
    df = df[~mask].copy()
    bad_real = sorted({int(v * x_tolerance) for v in bad_x})
    print(f"  [filter] removed {removed} detections at {len(bad_x)} high-freq x positions: {bad_real[:10]}")
    return df


def remove_blacklisted(df, blacklist, tolerance=3):
    """Remove detections within `tolerance` pixels of any blacklisted coordinate."""
    if not blacklist:
        return df
    mask = pd.Series(False, index=df.index)
    for (bx, by) in blacklist:
        mask |= (df["x"].sub(bx).abs() <= tolerance) & (df["y"].sub(by).abs() <= tolerance)
    removed = mask.sum()
    df = df[~mask].copy()
    print(f"  [filter] removed {removed} blacklisted coordinate detections")
    return df


def remove_consecutive_stuck(df, max_consecutive=5, tolerance=2):
    """
    Remove runs where the shuttle stays within `tolerance` pixels of the same
    position for more than `max_consecutive` frames in a row.
    A real shuttle always moves; anything frozen is a court artifact.
    """
    df = df.sort_values("frame").reset_index(drop=True)
    bad_indices = set()
    run_start = 0

    for i in range(1, len(df)):
        same = (abs(df.loc[i, "x"] - df.loc[run_start, "x"]) <= tolerance and
                abs(df.loc[i, "y"] - df.loc[run_start, "y"]) <= tolerance)
        if same:
            if (i - run_start) >= max_consecutive:
                bad_indices.add(i)
                bad_indices.add(run_start)
                for j in range(run_start + 1, i):
                    bad_indices.add(j)
        else:
            run_start = i

    before = len(df)
    df = df.drop(index=list(bad_indices)).reset_index(drop=True)
    print(f"  [filter] removed {before - len(df)} consecutive-stuck frames (>{max_consecutive} frames frozen)")
    return df


def remove_isolated(df, gap=8):
    """
    Keep only detections that have at least one neighbour within `gap` frames.
    Lone detections mid-air are almost always noise.
    """
    frames = set(df["frame"].values)
    keep = []
    for f in df["frame"].values:
        has_neighbour = any((f + d) in frames for d in range(-gap, gap + 1) if d != 0)
        keep.append(has_neighbour)
    before = len(df)
    df = df[keep].copy()
    print(f"  [filter] removed {before - len(df)} isolated single-frame detections")
    return df


def remove_out_of_court(df, polygon):
    """
    Remove detections whose (x, y) falls outside the court boundary polygon.
    polygon: numpy array of shape (4, 2) from detect_court_polygon().
    """
    if polygon is None:
        return df
    poly = polygon.astype(np.float32).reshape(-1, 1, 2)
    pts = df[['x', 'y']].values.astype(np.float32)
    inside = np.array([
        cv2.pointPolygonTest(poly, (float(x), float(y)), False) >= 0
        for x, y in pts
    ])
    before = len(df)
    df = df[inside].copy()
    print(f"  [filter] removed {before - len(df)} out-of-court detections")
    return df


def remove_slow_moving(df, min_speed_px=15, max_gap=15):
    """
    Remove detections where the shuttle isn't moving fast enough to be real.
    For each detection, compute max speed (px/frame) to its immediate neighbors.
    Real shuttlecock: 20-100+ px/frame. Players: 2-5 px/frame.
    max_gap prevents computing speed across rally boundaries (rallies separated by 30+ frames).
    """
    df = df.sort_values("frame").reset_index(drop=True)
    n = len(df)
    frames = df["frame"].values
    xs = df["x"].values
    ys = df["y"].values

    max_speed = np.zeros(n)
    for i in range(n):
        if i > 0:
            gap = int(frames[i] - frames[i - 1])
            if 0 < gap <= max_gap:
                dist = np.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
                max_speed[i] = max(max_speed[i], dist / gap)
        if i < n - 1:
            gap = int(frames[i + 1] - frames[i])
            if 0 < gap <= max_gap:
                dist = np.hypot(xs[i + 1] - xs[i], ys[i + 1] - ys[i])
                max_speed[i] = max(max_speed[i], dist / gap)

    keep = max_speed >= min_speed_px
    before = n
    df = df[keep].copy()
    print(f"  [filter] removed {before - len(df)} slow-moving detections (< {min_speed_px} px/frame)")
    return df


def extract_rallies(df, min_gap=30, min_length=10):
    """
    Group consecutive visible frames into rally segments.
    A new rally starts when there's a gap of >= min_gap frames.
    Returns list of dicts: {rally_id, start_frame, end_frame, frames_df}
    """
    if df.empty:
        return []

    rallies = []
    sorted_frames = df.sort_values("frame")
    frames = sorted_frames["frame"].values

    rally_id = 0
    seg_start = frames[0]
    seg_end = frames[0]

    for i in range(1, len(frames)):
        gap = frames[i] - frames[i - 1]
        if gap >= min_gap:
            seg_df = sorted_frames[(sorted_frames["frame"] >= seg_start) &
                                   (sorted_frames["frame"] <= seg_end)]
            if len(seg_df) >= min_length:
                rallies.append({
                    "rally_id": rally_id,
                    "start_frame": int(seg_start),
                    "end_frame": int(seg_end),
                    "length_frames": int(seg_end - seg_start + 1),
                    "data": seg_df
                })
                rally_id += 1
            seg_start = frames[i]
        seg_end = frames[i]

    # last segment
    seg_df = sorted_frames[(sorted_frames["frame"] >= seg_start) &
                           (sorted_frames["frame"] <= seg_end)]
    if len(seg_df) >= min_length:
        rallies.append({
            "rally_id": rally_id,
            "start_frame": int(seg_start),
            "end_frame": int(seg_end),
            "length_frames": int(seg_end - seg_start + 1),
            "data": seg_df
        })

    return rallies


def run(csv_path, out_dir=None, fps=30, video_path=None):
    csv_path = Path(csv_path)
    out_dir = Path(out_dir) if out_dir else csv_path.parent

    print(f"\nLoading: {csv_path}")
    df = load_raw(csv_path)
    print(f"  Total frames in CSV: {len(df)}")
    print(f"  Visible detections:  {(df['visible'] == 1).sum()}")

    BLACKLIST = [(382, 345), (486, 342)]

    df = remove_invisible(df)
    df = remove_blacklisted(df, BLACKLIST, tolerance=3)
    df = remove_stuck_clusters(df, tolerance=4, min_repeat=30)
    df = remove_consecutive_stuck(df, max_consecutive=5, tolerance=2)
    df = remove_isolated(df, gap=8)
    df = remove_slow_moving(df, min_speed_px=5, max_gap=15)

    print(f"  Clean detections:    {len(df)}")

    rallies = extract_rallies(df, min_gap=30, min_length=10)
    print(f"\nRallies detected: {len(rallies)}")

    rally_rows = []
    for r in rallies:
        dur_sec = r["length_frames"] / fps
        shuttle_frames = len(r["data"])
        print(f"  Rally {r['rally_id']:02d}: frames {r['start_frame']}-{r['end_frame']} "
              f"({dur_sec:.1f}s, {shuttle_frames} shuttle detections)")
        for _, row in r["data"].iterrows():
            rally_rows.append({
                "rally_id": r["rally_id"],
                "frame": row["frame"],
                "x": row["x"],
                "y": row["y"],
                "start_frame": r["start_frame"],
                "end_frame": r["end_frame"]
            })

    clean_df = pd.DataFrame(rally_rows)
    out_clean = out_dir / "shuttle_clean.csv"
    out_rallies_meta = out_dir / "rallies_meta.csv"

    clean_df.to_csv(out_clean, index=False)
    print(f"\nSaved clean CSV: {out_clean}")

    meta = pd.DataFrame([{
        "rally_id": r["rally_id"],
        "start_frame": r["start_frame"],
        "end_frame": r["end_frame"],
        "length_frames": r["length_frames"],
        "duration_sec": round(r["length_frames"] / fps, 2),
        "shuttle_detections": len(r["data"])
    } for r in rallies])
    meta.to_csv(out_rallies_meta, index=False)
    print(f"Saved rally metadata: {out_rallies_meta}")

    return clean_df, rallies


if __name__ == "__main__":
    import sys
    csv_path = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test_predict.csv"
    VIDEO = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
    run(csv_path,
        out_dir=r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads",
        video_path=VIDEO)
