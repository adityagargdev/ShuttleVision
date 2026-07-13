"""
YOLO-based player position tracking and court coverage heatmap.
Samples every N frames for performance. Requires ultralytics + yolov8n.pt.
"""

import cv2
import numpy as np
from pathlib import Path


def track_players(video_path, out_dir, court_polygon=None,
                  sample_every=8, frame_w=640, frame_h=360):
    """
    Detect players with YOLOv8 (COCO class 0 = person).
    Returns dict with positions list and heatmap path, or None on failure.
    """
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[player] ultralytics not available — skipping player tracking")
        return None

    model_path = Path(__file__).parent.parent / "yolov8n.pt"
    if not model_path.exists():
        print("[player] yolov8n.pt not found — skipping player tracking")
        return None

    model = YOLO(str(model_path))
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    positions = []
    frame_num = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_num % sample_every == 0:
            results = model(frame, classes=[0], verbose=False, conf=0.4)
            for box in results[0].boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                # Use foot position (bottom-centre of bounding box)
                fx = (x1 + x2) / 2
                fy = y2
                # Only keep detections in the court area (lower 2/3 of frame)
                if fy > frame_h * 0.25:
                    positions.append({"frame": frame_num, "x": round(fx), "y": round(fy)})

        frame_num += 1
        if frame_num % 1000 == 0:
            pct = 100 * frame_num // total
            print(f"[player] {frame_num}/{total} ({pct}%)")

    cap.release()

    if not positions:
        print("[player] no player detections found")
        return None

    heatmap_path = _save_player_heatmap(positions, frame_w, frame_h,
                                        court_polygon, out_dir)
    return {
        "total_detections": len(positions),
        "positions": positions[:2000],  # cap JSON size
        "heatmap_path": str(heatmap_path) if heatmap_path else None,
    }


def _save_player_heatmap(positions, frame_w, frame_h, polygon, out_dir):
    from analytics import draw_court_diagram, _map_to_topdown, COURT_W_PX, COURT_H_PX, PAD
    import pandas as pd

    court = draw_court_diagram()
    ch, cw = court.shape[:2]

    df = pd.DataFrame(positions)

    if polygon is not None:
        try:
            mapped = _map_to_topdown(df, polygon, frame_w, frame_h)
            in_canvas = (
                (mapped["x"] >= 0) & (mapped["x"] < cw) &
                (mapped["y"] >= 0) & (mapped["y"] < ch)
            )
            plot_df = mapped[in_canvas]
        except Exception:
            plot_df = _linear_scale(df, frame_w, frame_h, cw, ch)
    else:
        plot_df = _linear_scale(df, frame_w, frame_h, cw, ch)

    heat = np.zeros((ch, cw), dtype=np.float32)
    xs = plot_df["x"].values.astype(int)
    ys = plot_df["y"].values.astype(int)
    np.add.at(heat, (ys, xs), 1)

    heat = cv2.GaussianBlur(heat, (31, 31), 0)
    if heat.max() > 0:
        heat = (heat / heat.max() * 255).astype(np.uint8)

    active = heat > 8
    color_map = cv2.applyColorMap(heat, cv2.COLORMAP_HOT)
    out_img = court.copy()
    alpha = 0.7
    out_img[active] = (
        alpha * color_map[active].astype(float) +
        (1 - alpha) * court[active].astype(float)
    ).astype(np.uint8)

    out_path = Path(out_dir) / "player_heatmap.png"
    cv2.imwrite(str(out_path), out_img)
    print(f"[player] saved heatmap: {out_path}")
    return out_path


def _linear_scale(df, frame_w, frame_h, cw, ch):
    from analytics import COURT_W_PX, COURT_H_PX, PAD
    out = df.copy()
    out["x"] = (df["x"] / frame_w * COURT_W_PX + PAD).astype(int)
    out["y"] = (df["y"] / frame_h * COURT_H_PX + PAD).astype(int)
    return out
