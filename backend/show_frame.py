"""Save a video frame with a coordinate grid overlay so you can read off court corners."""
import cv2, sys
from pathlib import Path

VIDEO = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
OUT   = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\frame_grid.png"

cap = cv2.VideoCapture(VIDEO)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
cap.set(cv2.CAP_PROP_POS_FRAMES, total // 4)   # first quarter of video — usually mid-rally
ret, frame = cap.read()
cap.release()
if not ret:
    print("Could not read frame"); sys.exit(1)

h, w = frame.shape[:2]

# grid lines every 80px
for x in range(0, w, 80):
    cv2.line(frame, (x, 0), (x, h), (100, 100, 100), 1)
    cv2.putText(frame, str(x), (x + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255,255,0), 1)
for y in range(0, h, 40):
    cv2.line(frame, (0, y), (w, y), (100, 100, 100), 1)
    cv2.putText(frame, str(y), (2, y + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255,255,0), 1)

# mark the two known false-positive positions
for (fx, fy, label) in [(382, 345, "FP1"), (486, 342, "FP2")]:
    cv2.circle(frame, (fx, fy), 8, (0, 0, 255), 2)
    cv2.putText(frame, label, (fx + 10, fy), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

cv2.imwrite(OUT, frame)
print(f"Saved: {OUT}  ({w}x{h})")
print("Read off the 4 court corners from this image:")
print("  top-left, top-right, bottom-right, bottom-left")
