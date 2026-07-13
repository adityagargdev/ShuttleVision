"""
Automatic badminton court boundary detection.

Primary method: HSV color segmentation to find the court floor, then extract
4 extreme corners from the convex hull. Works for any camera angle as long as
the court surface color is distinct (green, blue, wood, etc.).

Fallback: Hough line detection (less reliable for perspective shots but
handles courts where the floor color blends with the background).
"""

import cv2
import numpy as np
from pathlib import Path


# HSV range for green badminton court floor
# H=35-90 covers yellow-green through cyan; adjust if court is different color
COURT_HSV_LOWER = np.array([35, 50, 50])
COURT_HSV_UPPER = np.array([90, 255, 255])
COURT_MIN_AREA_FRACTION = 0.15   # court must cover at least 15% of frame


def _get_frames(video_path, fractions=(0.05, 0.15, 0.25, 0.5)):
    """Sample multiple frames from the video."""
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    for frac in fractions:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * frac))
        ret, frame = cap.read()
        if ret:
            frames.append(frame)
    cap.release()
    return frames


def _order_corners(pts):
    """
    Order 4 corner points as [TL, TR, BR, BL].
    Uses sum/diff of coordinates — robust to any quadrilateral orientation.
    TL = min(x+y), BR = max(x+y), TR = max(x-y), BL = min(x-y).
    """
    pts = np.array(pts, dtype=np.float32)
    s = pts.sum(axis=1)          # x + y
    d = pts[:, 0] - pts[:, 1]   # x - y
    return np.array([
        pts[np.argmin(s)],    # TL: small x, small y
        pts[np.argmax(d)],    # TR: large x, small y  → max(x-y)
        pts[np.argmax(s)],    # BR: large x, large y
        pts[np.argmin(d)],    # BL: small x, large y  → min(x-y)
    ])


def _detect_by_color(frame):
    """
    Detect court boundary by color segmentation (green court floor).
    Returns ordered (TL, TR, BR, BL) corners or None.
    """
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, COURT_HSV_LOWER, COURT_HSV_UPPER)

    # Clean up: open removes noise blobs, close fills gaps (player legs, white lines)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=3)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < COURT_MIN_AREA_FRACTION * h * w:
        return None

    # Extract 4 extreme corners from convex hull
    hull = cv2.convexHull(largest).reshape(-1, 2).astype(np.float32)
    return _order_corners(hull)


def _detect_by_hough(frame):
    """
    Fallback: detect court corners from Hough line intersections.
    Works best for courts where the floor color is not easily segmented.
    Groups lines into near-horizontal (baselines) and diagonal (sidelines) families.
    """
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    _, bright = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    adaptive = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, -8
    )
    combined = cv2.bitwise_or(bright, adaptive)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)
    edges = cv2.Canny(combined, 50, 150)
    hough_lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold=150)

    if hough_lines is None:
        return None

    # Cluster near-duplicate lines
    flat = [(float(l[0][0]), float(l[0][1])) for l in hough_lines]
    clusters = _cluster_lines(flat, angle_tol_deg=12, rho_tol=30)
    if len(clusters) < 4:
        return None

    # Separate into near-horizontal (baselines) and diagonal (sidelines)
    HBASELINE = 70   # theta range for near-horizontal lines (degrees)
    HBASELINE2 = 110

    baselines = [(r, t) for r, t in clusters
                 if HBASELINE <= np.degrees(t) <= HBASELINE2]
    diagonals = [(r, t) for r, t in clusters
                 if np.degrees(t) < HBASELINE or np.degrees(t) > HBASELINE2]

    if len(baselines) < 2 or len(diagonals) < 2:
        return None

    # Outermost baselines (smallest and largest rho = far and near)
    baselines_sorted = sorted(baselines, key=lambda l: l[0])
    top_bl = baselines_sorted[0]
    bot_bl = baselines_sorted[-1]

    # Two sidelines: the diagonal with smallest theta and largest theta
    diagonals_sorted = sorted(diagonals, key=lambda l: l[1])
    left_sl = diagonals_sorted[0]
    right_sl = diagonals_sorted[-1]

    # Intersect baselines × sidelines to get 4 corners
    corners_raw = []
    for bl in [top_bl, bot_bl]:
        for sl in [left_sl, right_sl]:
            pt = _line_intersection(bl, sl)
            if pt is not None:
                corners_raw.append(pt)

    if len(corners_raw) != 4:
        return None

    corners = _order_corners(np.array(corners_raw))
    corners[:, 0] = np.clip(corners[:, 0], -50, w + 50)
    corners[:, 1] = np.clip(corners[:, 1], -50, h + 50)
    return corners


def _cluster_lines(flat, angle_tol_deg=12, rho_tol=30):
    """Merge near-duplicate (rho, theta) line pairs into representative clusters."""
    used = [False] * len(flat)
    clusters = []
    for i, (r1, t1) in enumerate(flat):
        if used[i]:
            continue
        group = [(r1, t1)]
        used[i] = True
        for j, (r2, t2) in enumerate(flat[i + 1:], start=i + 1):
            if used[j]:
                continue
            angle_diff = abs(np.degrees(t1 - t2)) % 180
            angle_diff = min(angle_diff, 180 - angle_diff)
            if angle_diff < angle_tol_deg and abs(r1 - r2) < rho_tol:
                group.append((r2, t2))
                used[j] = True
        clusters.append((np.mean([g[0] for g in group]),
                         np.mean([g[1] for g in group])))
    return clusters


def _line_intersection(l1, l2):
    """Compute intersection point of two (rho, theta) lines."""
    r1, t1 = l1
    r2, t2 = l2
    A = np.array([[np.cos(t1), np.sin(t1)],
                  [np.cos(t2), np.sin(t2)]])
    b = np.array([r1, r2])
    try:
        return np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        return None


def _polygon_valid(corners, min_span=100):
    """Check that corners span a real quadrilateral (not degenerate)."""
    if corners is None or len(corners) != 4:
        return False
    xs, ys = corners[:, 0], corners[:, 1]
    return (xs.max() - xs.min()) > min_span and (ys.max() - ys.min()) > min_span


def detect_court_polygon(video_path, debug_out=None):
    """
    Auto-detect the 4-corner court boundary polygon from a video.

    Returns: numpy array of shape (4, 2) with [x, y] corners in order
             (TL, TR, BR, BL), or None if detection fails.
    """
    frames = _get_frames(video_path)
    if not frames:
        return None

    h, w = frames[0].shape[:2]

    # --- Primary: color-based detection ---
    best_corners = None
    best_area = 0
    best_frame = frames[0]

    for frame in frames:
        corners = _detect_by_color(frame)
        if corners is not None and _polygon_valid(corners):
            xs, ys = corners[:, 0], corners[:, 1]
            area = (xs.max() - xs.min()) * (ys.max() - ys.min())
            if area > best_area:
                best_area = area
                best_corners = corners
                best_frame = frame

    if best_corners is not None:
        corners_int = best_corners.astype(int)
        if debug_out:
            _save_debug(best_frame, best_corners, [], debug_out, method="color")
        print(f"[court] color-based corners: {corners_int.tolist()}")
        return corners_int

    # --- Fallback: Hough line detection ---
    print("[court] color detection failed — trying Hough lines")
    for frame in frames:
        corners = _detect_by_hough(frame)
        if corners is not None and _polygon_valid(corners):
            corners_int = corners.astype(int)
            if debug_out:
                _save_debug(frame, corners, [], debug_out, method="hough")
            print(f"[court] hough-based corners: {corners_int.tolist()}")
            return corners_int

    print(f"[court] both methods failed — using full frame")
    return _full_frame_polygon(w, h)


def _full_frame_polygon(w, h, margin=10):
    """Fallback: use the whole frame as the court area."""
    return np.array([[margin, margin], [w - margin, margin],
                     [w - margin, h - margin], [margin, h - margin]], dtype=int)


def make_court_mask(polygon, frame_w, frame_h):
    """Return a binary mask (H×W uint8) with 255 inside the court polygon."""
    mask = np.zeros((frame_h, frame_w), dtype=np.uint8)
    if polygon is not None:
        cv2.fillPoly(mask, [polygon.astype(np.int32)], 255)
    else:
        mask[:] = 255
    return mask


def _save_debug(frame, corners, clusters, out_path, method=""):
    vis = frame.copy()
    if clusters:
        for r, t in clusters:
            a, b = np.cos(t), np.sin(t)
            x0, y0 = a * r, b * r
            cv2.line(vis,
                     (int(x0 + 2000 * (-b)), int(y0 + 2000 * a)),
                     (int(x0 - 2000 * (-b)), int(y0 - 2000 * a)),
                     (0, 255, 0), 1)
    pts = corners.astype(np.int32).reshape((-1, 1, 2))
    cv2.polylines(vis, [pts], True, (0, 0, 255), 2)
    labels = ["TL", "TR", "BR", "BL"]
    for i, pt in enumerate(corners.astype(int)):
        cv2.circle(vis, tuple(pt), 6, (255, 0, 0), -1)
        cv2.putText(vis, labels[i], (pt[0]+8, pt[1]-4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,0), 1)
    if method:
        cv2.putText(vis, f"method: {method}", (10, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)
    cv2.imwrite(str(out_path), vis)
    print(f"[court] debug image: {out_path}")


if __name__ == "__main__":
    import sys
    video = sys.argv[1] if len(sys.argv) > 1 else \
        r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
    debug = str(Path(video).parent / "court_debug.png")
    poly = detect_court_polygon(video, debug_out=debug)
    print("Polygon:", poly)
    if poly is not None:
        import subprocess
        subprocess.Popen(["start", debug], shell=True)
