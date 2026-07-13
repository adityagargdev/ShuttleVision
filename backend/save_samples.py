import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from detector import BadmintonDetector
import cv2

video_path = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
out_dir = r"C:\Users\swati\OneDrive\Desktop\badminton_app\samples"
os.makedirs(out_dir, exist_ok=True)

detector = BadmintonDetector()
cap = cv2.VideoCapture(video_path)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

# sample at frames 100, 150, 200, 250, 280 to get mid-rally frames
sample_at = {100, 150, 200, 250, 280}
saved = 0
frame_count = 0
shuttle_frames = 0

print(f"Video has {total_frames} total frames. Processing 300...")

while cap.isOpened() and frame_count < 300:
    ret, frame = cap.read()
    if not ret:
        break

    det = detector.detect_frame(frame)
    if det["shuttles"]:
        shuttle_frames += 1

    if frame_count in sample_at:
        vis = frame.copy()

        # draw shuttle (yellow dot + box)
        for s in det["shuttles"][:1]:
            x1, y1, x2, y2 = s["bbox"]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 255), 2)
            cv2.circle(vis, tuple(s["center"]), 10, (0, 255, 255), -1)
            cv2.putText(vis, f"shuttle", (x1, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

        # draw players (green)
        for i, p in enumerate(det["players"]):
            x1, y1, x2, y2 = p["bbox"]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(vis, f"P{i+1} {p['conf']:.2f}", (x1, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

        label = f"Frame {frame_count} | Shuttle: {len(det['shuttles'])} | Players: {len(det['players'])}"
        cv2.putText(vis, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)

        path = os.path.join(out_dir, f"frame_{frame_count}.jpg")
        cv2.imwrite(path, vis)
        print(f"Saved: {path}")
        saved += 1

    frame_count += 1

cap.release()
pct = 100 * shuttle_frames // max(frame_count, 1)
print(f"\n--- Results ---")
print(f"Shuttle detected: {shuttle_frames}/{frame_count} = {pct}%")
print(f"Sample frames saved to: {out_dir}")
