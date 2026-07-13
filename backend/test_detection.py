import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from detector import BadmintonDetector
import cv2

video_path = r"C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4"
detector = BadmintonDetector()
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("Could not open video")
    sys.exit(1)

total = 0
shuttle_frames = 0
player_counts = []

print("Testing detection on 300 frames (no window)...")
while cap.isOpened() and total < 300:
    ret, frame = cap.read()
    if not ret:
        break
    det = detector.detect_frame(frame)
    if det["shuttles"]:
        shuttle_frames += 1
    player_counts.append(len(det["players"]))
    total += 1
    if total % 50 == 0:
        print(f"  {total}/300 frames processed...")

cap.release()

shuttle_pct = 100 * shuttle_frames // max(total, 1)
avg_players = sum(player_counts) / max(len(player_counts), 1)
print(f"\n--- Results over {total} frames ---")
print(f"Shuttlecock detected: {shuttle_frames}/{total} frames = {shuttle_pct}%")
print(f"Average players per frame: {avg_players:.1f}")
