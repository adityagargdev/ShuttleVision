"""
Extract shuttle trajectory arcs from the clean detection CSV.
Each arc is a continuous run of detections between large frame gaps.
"""


def extract_trajectories(df, max_gap=12, min_arc_len=3):
    """
    Group consecutive shuttle detections into arc segments.
    Returns list of {rally_id, arc_id, frames, xs, ys}.
    """
    arcs = []

    for rally_id, grp in df.groupby("rally_id"):
        grp = grp.sort_values("frame").reset_index(drop=True)
        arc_id = 0
        seg_start = 0

        for i in range(1, len(grp)):
            gap = int(grp["frame"].iloc[i] - grp["frame"].iloc[i - 1])
            if gap > max_gap:
                seg = grp.iloc[seg_start:i]
                if len(seg) >= min_arc_len:
                    arcs.append({
                        "rally_id": int(rally_id),
                        "arc_id": arc_id,
                        "frames": seg["frame"].tolist(),
                        "xs": seg["x"].tolist(),
                        "ys": seg["y"].tolist(),
                    })
                    arc_id += 1
                seg_start = i

        seg = grp.iloc[seg_start:]
        if len(seg) >= min_arc_len:
            arcs.append({
                "rally_id": int(rally_id),
                "arc_id": arc_id,
                "frames": seg["frame"].tolist(),
                "xs": seg["x"].tolist(),
                "ys": seg["y"].tolist(),
            })

    return arcs
