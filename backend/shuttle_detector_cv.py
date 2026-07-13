"""
Background subtraction shuttlecock detector.
No model, no training — finds the fastest small moving blob per frame.
Outputs same CSV format as TrackNet: frame_num, visible, x, y
"""

import cv2
import numpy as np
import pandas as pd
from pathlib import Path

# Tuning constants
MAX_BBOX       = 20    # px — shuttle bounding box must be < 20×20
MIN_AREA       = 3     # px²
MAX_AREA       = 350   # px²
MIN_SPEED      = 10    # px/frame minimum displacement (filters truly static artifacts)
MAX_SPEED      = 350   # px/frame maximum plausible displacement per frame
MIN_BRIGHTNESS = 200   # 0-255 — shuttle is white; reject dark blobs (player clothing)
MOG2_HISTORY   = 300
MOG2_THRESHOLD = 40
MISS_RESET     = 20    # consecutive misses before dropping last_pos


def _get_candidates(fg, frame_gray, min_area, max_area, max_bbox, min_brightness):
    """
    Return (cx, cy, area) for blobs that are:
      - Small bounding box (< max_bbox × max_bbox)
      - Bright in the original frame (white shuttle, not dark clothing)
    """
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bw > max_bbox or bh > max_bbox:
            continue
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        M = cv2.moments(cnt)
        if M["m00"] <= 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])

        # Brightness check — sample a small patch around the centroid
        y1, y2 = max(0, cy - 4), min(frame_gray.shape[0], cy + 5)
        x1, x2 = max(0, cx - 4), min(frame_gray.shape[1], cx + 5)
        patch = frame_gray[y1:y2, x1:x2]
        if patch.size == 0 or patch.max() < min_brightness:
            continue   # too dark to be the shuttle

        out.append((cx, cy, area))
    return out


def detect_shuttle(video_path, out_csv, start_frame=0, end_frame=None):
    cap = cv2.VideoCapture(str(video_path))
    fps   = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if end_frame is None:
        end_frame = total

    print(f"Video: {w}x{h} @ {fps:.1f}fps  |  {total} total frames")
    print(f"Processing frames {start_frame} to {end_frame}")

    bg_sub = cv2.createBackgroundSubtractorMOG2(
        history=MOG2_HISTORY, varThreshold=MOG2_THRESHOLD, detectShadows=False
    )
    kernel_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    rows = []
    last_pos   = None
    miss_count = 0

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    for frame_num in range(start_frame, end_frame):
        ret, frame = cap.read()
        if not ret:
            break

        fg = bg_sub.apply(frame)
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,  kernel_open)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, kernel_close)

        frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        candidates = _get_candidates(fg, frame_gray, MIN_AREA, MAX_AREA, MAX_BBOX, MIN_BRIGHTNESS)

        best = None
        if candidates:
            if last_pos is None:
                # No prior position — don't latch onto just anything.
                # Only accept a seed if there's exactly ONE bright small blob
                # (multiple candidates means players are moving → too ambiguous).
                if len(candidates) == 1:
                    best = candidates[0]
            else:
                lx, ly = last_pos
                scored = []
                for cx, cy, area in candidates:
                    dist = np.hypot(cx - lx, cy - ly)
                    # Must move at least MIN_SPEED (rules out static player fragments)
                    # and not more than MAX_SPEED (rules out noise jumps)
                    if MIN_SPEED <= dist <= MAX_SPEED:
                        score = dist / (area + 1)   # fast + small = shuttle
                        scored.append((score, cx, cy, area))
                if scored:
                    scored.sort(reverse=True)
                    _, bx, by, _ = scored[0]
                    best = (bx, by, _)

        if best:
            x, y, _ = best
            last_pos   = (x, y)
            miss_count = 0
            rows.append({"frame_num": frame_num, "visible": 1, "x": x, "y": y})
        else:
            miss_count += 1
            if miss_count >= MISS_RESET:
                last_pos = None
            rows.append({"frame_num": frame_num, "visible": 0, "x": 0, "y": 0})

        if frame_num % 1000 == 0 and frame_num > start_frame:
            pct = 100 * (frame_num - start_frame) / (end_frame - start_frame)
            visible_so_far = sum(1 for r in rows if r["visible"] == 1)
            print(f"  {frame_num}/{end_frame}  ({pct:.0f}%)  detections so far: {visible_so_far}")

    cap.release()

    df = pd.DataFrame(rows)
    df.to_csv(str(out_csv), index=False)
    visible = (df["visible"] == 1).sum()
    print(f"\nDone. {visible}/{len(df)} frames with detection ({100*visible/max(len(df),1):.1f}%)")
    print(f"Saved: {out_csv}")
    return df


if __name__ == "__main__":
    import sys
    VIDEO = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
    OUT_CSV = str(Path(VIDEO).parent / "shuttle_cv_predict.csv")
    detect_shuttle(VIDEO, OUT_CSV)
