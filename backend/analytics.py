"""
Badminton match analytics from filtered shuttle CSV.
Generates: heatmaps, shot zones, rally stats, shot speed, winners/errors estimate.
"""

import pandas as pd
import numpy as np
import cv2
from pathlib import Path
from court_detector import detect_court_polygon, make_court_mask


# Court zones (relative to frame width/height) — broadcast top-down perspective
# Near side = bottom half, Far side = top half
ZONES = {
    "near_left":    (0.0,  0.5,  0.0,  0.5),   # (x_min, x_max, y_min, y_max) normalized
    "near_center":  (0.33, 0.67, 0.0,  0.5),
    "near_right":   (0.5,  1.0,  0.0,  0.5),
    "far_left":     (0.0,  0.5,  0.5,  1.0),
    "far_center":   (0.33, 0.67, 0.5,  1.0),
    "far_right":    (0.5,  1.0,  0.5,  1.0),
}


def load_clean(csv_path):
    df = pd.read_csv(csv_path)
    required = {"rally_id", "frame", "x", "y"}
    assert required.issubset(df.columns), f"Missing columns: {required - set(df.columns)}"
    return df


# ── Top-down court diagram ────────────────────────────────────────────────────

# Standard BWF doubles court: 13.4m long x 6.1m wide
# We render at a fixed canvas size and map video coords via homography (if available)
COURT_W_PX = 400   # canvas width  (represents court width  6.1m)
COURT_H_PX = 760   # canvas height (represents court length 13.4m)
PAD = 50           # padding around court lines


def draw_court_diagram():
    """Draw a clean top-down badminton court diagram on a dark background."""
    cw, ch = COURT_W_PX + 2 * PAD, COURT_H_PX + 2 * PAD
    img = np.full((ch, cw, 3), 30, dtype=np.uint8)   # dark grey background

    def px(x_norm, y_norm):
        return (PAD + int(x_norm * COURT_W_PX), PAD + int(y_norm * COURT_H_PX))

    LINE = (220, 220, 220)
    NET  = (100, 200, 255)
    THIN, THICK = 1, 2

    # outer boundary
    cv2.rectangle(img, px(0, 0), px(1, 1), LINE, THICK)

    # net (centre)
    cv2.line(img, px(0, 0.5), px(1, 0.5), NET, 2)

    # service lines (short service: 1.98m from net = 14.8% of 13.4m)
    svc = 0.198 / 1.34
    cv2.line(img, px(0, 0.5 - svc), px(1, 0.5 - svc), LINE, THIN)
    cv2.line(img, px(0, 0.5 + svc), px(1, 0.5 + svc), LINE, THIN)

    # long service line for doubles (0.76m from baseline = 5.7%)
    ls = 0.076 / 1.34
    cv2.line(img, px(0, ls),     px(1, ls),     LINE, THIN)
    cv2.line(img, px(0, 1 - ls), px(1, 1 - ls), LINE, THIN)

    # centre line
    cv2.line(img, px(0.5, 0.5 - svc), px(0.5, 0.5 + svc), LINE, THIN)

    # singles sidelines (4.57cm in from edge = 37.5% of 6.1m → 18.75% from each side)
    sing = 0.457 / 6.1
    cv2.line(img, px(sing, 0),     px(sing, 1),     LINE, THIN)
    cv2.line(img, px(1 - sing, 0), px(1 - sing, 1), LINE, THIN)

    # labels
    cv2.putText(img, "NET", (PAD + COURT_W_PX // 2 - 15, PAD + COURT_H_PX // 2 - 6),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, NET, 1)
    cv2.putText(img, "FAR COURT",
                (PAD + 5, PAD + COURT_H_PX // 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 160, 160), 1)
    cv2.putText(img, "NEAR COURT",
                (PAD + 5, PAD + 3 * COURT_H_PX // 4),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 160, 160), 1)

    return img


def _map_to_topdown(df, src_polygon, frame_w, frame_h):
    """
    Map shuttle (x,y) from video-frame space to top-down court canvas using homography.
    src_polygon: 4 corners [[x,y],...] in video frame (TL, TR, BR, BL order).
    Returns new DataFrame with (x,y) in top-down canvas coordinates.
    """
    cw, ch = COURT_W_PX + 2 * PAD, COURT_H_PX + 2 * PAD
    dst = np.array([[PAD, PAD],
                    [PAD + COURT_W_PX, PAD],
                    [PAD + COURT_W_PX, PAD + COURT_H_PX],
                    [PAD, PAD + COURT_H_PX]], dtype=np.float32)
    src = src_polygon.astype(np.float32)
    H, _ = cv2.findHomography(src, dst)

    pts = np.column_stack([df["x"].values, df["y"].values]).astype(np.float32)
    pts_h = np.concatenate([pts, np.ones((len(pts), 1))], axis=1)
    mapped = (H @ pts_h.T).T
    mapped = mapped[:, :2] / mapped[:, 2:3]

    # No clipping — let caller filter out-of-canvas points so they don't
    # pile up at canvas edges and create false density at court boundaries.
    out = df.copy()
    out["x"] = mapped[:, 0].astype(int)
    out["y"] = mapped[:, 1].astype(int)
    return out


# ── Heatmap ───────────────────────────────────────────────────────────────────

def save_heatmap(df, frame_w, frame_h, out_path, video_path=None, blur=25, alpha=0.75):
    """
    Generate shuttle heatmap overlaid on a top-down court diagram.
    Uses homography if court corners can be detected; falls back to linear scaling.
    """
    court_img = draw_court_diagram()
    ch, cw = court_img.shape[:2]

    polygon = None
    if video_path and Path(video_path).exists():
        polygon = detect_court_polygon(video_path)

    def _polygon_valid(poly):
        """Check that detected corners actually span a real rectangle."""
        if poly is None or len(poly) != 4:
            return False
        xs, ys = poly[:, 0], poly[:, 1]
        return (xs.max() - xs.min()) > 100 and (ys.max() - ys.min()) > 100

    plot_df = None

    if _polygon_valid(polygon):
        mapped_df = _map_to_topdown(df, polygon, frame_w, frame_h)
        # Exclude points that map outside the canvas — these are airborne shuttle
        # positions above the court floor whose homography projection is undefined.
        # Clipping them to canvas edges creates false density at court boundaries.
        in_canvas = (
            (mapped_df["x"] >= 0) & (mapped_df["x"] < cw) &
            (mapped_df["y"] >= 0) & (mapped_df["y"] < ch)
        )
        n_in = int(in_canvas.sum())
        print(f"  [heatmap] homography: {n_in}/{len(mapped_df)} points within canvas")
        if n_in >= 30:
            plot_df = mapped_df[in_canvas]
            print("  [heatmap] using homography to top-down court")

    if plot_df is None:
        plot_df = df.copy()
        plot_df["x"] = (df["x"] / frame_w * COURT_W_PX + PAD).astype(int)
        plot_df["y"] = (df["y"] / frame_h * COURT_H_PX + PAD).astype(int)
        print("  [heatmap] court polygon invalid/missing — using linear scaling")

    # build heat on court canvas
    heat = np.zeros((ch, cw), dtype=np.float32)
    xs = plot_df["x"].values.astype(int)
    ys = plot_df["y"].values.astype(int)
    np.add.at(heat, (ys, xs), 1)

    if blur > 0:
        heat = cv2.GaussianBlur(heat, (blur | 1, blur | 1), 0)
    if heat.max() > 0:
        heat = (heat / heat.max() * 255).astype(np.uint8)

    active = heat > 8
    color_map = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
    out = court_img.copy()
    out[active] = (
        alpha * color_map[active].astype(float) +
        (1 - alpha) * court_img[active].astype(float)
    ).astype(np.uint8)

    cv2.putText(out, "Shuttle density  (blue=low  red=high)",
                (PAD, ch - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

    cv2.imwrite(str(out_path), out)
    print(f"  Saved heatmap: {out_path}")
    return out


# ── Shot zones ────────────────────────────────────────────────────────────────

def shot_zone_counts(df, frame_w, frame_h):
    """
    Returns dict of zone_name -> count + percentage.
    """
    nx = df["x"] / frame_w
    ny = df["y"] / frame_h
    results = {}
    for name, (x0, x1, y0, y1) in ZONES.items():
        mask = (nx >= x0) & (nx < x1) & (ny >= y0) & (ny < y1)
        results[name] = int(mask.sum())
    total = sum(results.values())
    return {k: {"count": v, "pct": round(100 * v / max(total, 1), 1)}
            for k, v in results.items()}


# ── Speed estimation ──────────────────────────────────────────────────────────

def estimate_speed(df, fps=30, pixels_per_meter=None):
    """
    Compute per-frame pixel displacement within each rally.
    Returns DataFrame with speed_px (and speed_mps if calibration given).
    """
    rows = []
    for rally_id, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame")
        dx = grp["x"].diff()
        dy = grp["y"].diff()
        df_gap = grp["frame"].diff()
        px_speed = np.sqrt(dx**2 + dy**2) / df_gap.clip(lower=1) * fps
        for i, (_, row) in enumerate(grp.iterrows()):
            rows.append({
                "rally_id": rally_id,
                "frame": row["frame"],
                "x": row["x"],
                "y": row["y"],
                "speed_px_per_sec": round(px_speed.iloc[i], 1) if i > 0 else 0.0
            })

    speed_df = pd.DataFrame(rows)
    if pixels_per_meter is not None:
        speed_df["speed_mps"] = speed_df["speed_px_per_sec"] / pixels_per_meter
        speed_df["speed_kmh"] = speed_df["speed_mps"] * 3.6
    return speed_df


# ── Rally stats ───────────────────────────────────────────────────────────────

def rally_stats(df, fps=30):
    """
    Per-rally summary: duration, shuttle detections, avg/max speed.
    """
    rows = []
    for rally_id, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame")
        start_f = grp["frame"].iloc[0]
        end_f = grp["frame"].iloc[-1]
        duration = (end_f - start_f) / fps

        dx = grp["x"].diff()
        dy = grp["y"].diff()
        df_gap = grp["frame"].diff().clip(lower=1)
        speeds = np.sqrt(dx**2 + dy**2) / df_gap * fps

        rows.append({
            "rally_id": rally_id,
            "start_frame": start_f,
            "end_frame": end_f,
            "duration_sec": round(duration, 2),
            "shuttle_frames": len(grp),
            "avg_speed_px": round(speeds[1:].mean(), 1) if len(speeds) > 1 else 0,
            "max_speed_px": round(speeds[1:].max(), 1) if len(speeds) > 1 else 0,
        })
    return pd.DataFrame(rows)


# ── Direction changes (shot detection) ───────────────────────────────────────

def detect_shots(df, fps=30, min_speed_px=60, direction_change_deg=90):
    """
    Approximate shot events: points where shuttle direction reverses sharply.
    Returns list of {rally_id, frame, x, y, type} where type is 'shot'.
    """
    shots = []
    for rally_id, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame").reset_index(drop=True)
        if len(grp) < 3:
            continue
        dx = grp["x"].diff()
        dy = grp["y"].diff()
        df_gap = grp["frame"].diff().clip(lower=1)
        speed = np.sqrt(dx**2 + dy**2) / df_gap * fps

        for i in range(1, len(grp) - 1):
            v1 = np.array([dx.iloc[i], dy.iloc[i]])
            v2 = np.array([dx.iloc[i + 1], dy.iloc[i + 1]])
            n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
            if n1 < 1e-6 or n2 < 1e-6:
                continue
            cos_a = np.dot(v1, v2) / (n1 * n2)
            angle = np.degrees(np.arccos(np.clip(cos_a, -1, 1)))
            if angle > direction_change_deg and speed.iloc[i] > min_speed_px:
                shots.append({
                    "rally_id": rally_id,
                    "frame": int(grp["frame"].iloc[i]),
                    "x": int(grp["x"].iloc[i]),
                    "y": int(grp["y"].iloc[i]),
                    "type": "shot"
                })
    return shots


# ── Full report ───────────────────────────────────────────────────────────────

def run_analytics(clean_csv, frame_w=640, frame_h=360, fps=30, out_dir=None, video_path=None):
    clean_csv = Path(clean_csv)
    out_dir = Path(out_dir) if out_dir else clean_csv.parent

    print(f"\nRunning analytics on: {clean_csv}")
    df = load_clean(clean_csv)
    print(f"  {len(df)} clean shuttle detections across {df['rally_id'].nunique()} rallies")

    # heatmap overlaid on real video frame
    heatmap_path = out_dir / "shuttle_heatmap.png"
    save_heatmap(df, frame_w, frame_h, heatmap_path, video_path=video_path)

    # rally stats
    rstats = rally_stats(df, fps=fps)
    rstats.to_csv(out_dir / "rally_stats.csv", index=False)
    print(f"  Saved rally stats: {out_dir / 'rally_stats.csv'}")

    # shot zones
    zones = shot_zone_counts(df, frame_w, frame_h)
    print("\nShot zones:")
    for zone, info in zones.items():
        print(f"  {zone:15s}: {info['count']:4d} frames ({info['pct']:5.1f}%)")

    # shot detection
    shots = detect_shots(df, fps=fps)
    shots_df = pd.DataFrame(shots)
    if not shots_df.empty:
        shots_df.to_csv(out_dir / "shots.csv", index=False)
        print(f"\nEstimated shot events: {len(shots_df)}")
        print(f"  Saved to: {out_dir / 'shots.csv'}")

    # summary
    print(f"\nSummary:")
    print(f"  Total rallies:  {len(rstats)}")
    if len(rstats):
        print(f"  Avg rally dur:  {rstats['duration_sec'].mean():.1f}s")
        print(f"  Max rally dur:  {rstats['duration_sec'].max():.1f}s")
        print(f"  Avg speed:      {rstats['avg_speed_px'].mean():.0f} px/s")

    return {
        "rally_stats": rstats,
        "shot_zones": zones,
        "shots": shots_df if not shots_df.empty else pd.DataFrame(),
    }


if __name__ == "__main__":
    import sys
    csv_path = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\shuttle_clean.csv"
    VIDEO = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
    run_analytics(csv_path,
                  frame_w=640, frame_h=360,
                  out_dir=r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads",
                  video_path=VIDEO)
