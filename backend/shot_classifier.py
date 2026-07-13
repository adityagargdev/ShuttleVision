"""
Heuristic shot type classifier based on speed + direction of travel.
Works on the clean shuttle CSV from csv_filter.py.

Shot types (in video-frame coordinates where y increases downward):
  smash   — fast, steeply downward (dy > 0 = toward near court)
  clear   — fast, upward (dy < 0 = toward far court)
  drop    — medium speed, downward
  lift    — medium speed, upward from near court
  drive   — fast, mostly horizontal
  net     — slow, near net x-band
"""

import numpy as np
import pandas as pd


def _shot_type(speed_pxs, dy_norm, dx_norm):
    downward = dy_norm > 0.25
    upward = dy_norm < -0.25

    if speed_pxs > 2000:
        if downward:
            return "smash"
        elif upward:
            return "clear"
        return "drive"
    elif speed_pxs > 800:
        if downward:
            return "smash"
        elif upward:
            return "clear"
        return "drive"
    elif speed_pxs > 300:
        if downward:
            return "drop"
        elif upward:
            return "lift"
        return "drive"
    return "net"


def classify_shots(df, fps=25, min_speed_px=60, direction_change_deg=90):
    """
    Find direction-change events and classify each shot.
    Returns list of dicts: {rally_id, frame, x, y, speed, type}
    """
    shots = []

    for rally_id, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame").reset_index(drop=True)
        if len(grp) < 3:
            continue

        dx = grp["x"].diff()
        dy = grp["y"].diff()
        df_gap = grp["frame"].diff().clip(lower=1)
        speed = np.sqrt(dx ** 2 + dy ** 2) / df_gap * fps

        for i in range(1, len(grp) - 1):
            v1 = np.array([float(dx.iloc[i]), float(dy.iloc[i])])
            v2 = np.array([float(dx.iloc[i + 1]), float(dy.iloc[i + 1])])
            n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
            if n1 < 1e-6 or n2 < 1e-6:
                continue

            cos_a = np.dot(v1, v2) / (n1 * n2)
            angle = np.degrees(np.arccos(np.clip(cos_a, -1, 1)))

            if angle > direction_change_deg and float(speed.iloc[i]) > min_speed_px:
                post_speed = float(speed.iloc[i + 1]) if i + 1 < len(speed) else float(speed.iloc[i])
                v_post = v2 / n2
                shot_type = _shot_type(post_speed, float(v_post[1]), float(v_post[0]))

                shots.append({
                    "rally_id": int(rally_id),
                    "frame": int(grp["frame"].iloc[i]),
                    "x": int(grp["x"].iloc[i]),
                    "y": int(grp["y"].iloc[i]),
                    "speed": round(post_speed, 1),
                    "type": shot_type,
                })

    return shots
