from ultralytics import YOLO
import cv2
import numpy as np
from pathlib import Path

MODEL_DIR = Path("C:/Users/swati/badminton_models")


class BadmintonDetector:
    def __init__(self):
        self.player_model = YOLO("yolov8n.pt")
        self.shuttle_tracker = None
        try:
            from tracknet_tracker import TrackNetTracker
            self.shuttle_tracker = TrackNetTracker(MODEL_DIR / "track.pt")
        except Exception as e:
            print(f"[TrackNet] failed to load ({e}) — falling back to background subtraction")
            self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
                history=50, varThreshold=40, detectShadows=False
            )

    def detect_frame(self, frame, max_players=4):
        h, w = frame.shape[:2]

        # --- PLAYER DETECTION ---
        player_results = self.player_model(frame, conf=0.35, classes=[0], verbose=False)[0]

        candidates = []
        for box in player_results.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            bw, bh = x2 - x1, y2 - y1
            area = bw * bh
            aspect = bh / max(bw, 1)
            in_zone = (0.16 * w < cx < 0.84 * w) and (cy > 0.25 * h)
            is_person = aspect > 1.0 and area > 2500
            if in_zone and is_person:
                candidates.append({
                    "bbox": [x1, y1, x2, y2],
                    "center": [cx, cy],
                    "conf": conf,
                    "area": area,
                    "cy": cy
                })

        near = [p for p in candidates if p["cy"] > 0.5 * h]
        far  = [p for p in candidates if p["cy"] <= 0.5 * h]
        near.sort(key=lambda p: p["area"], reverse=True)
        far.sort(key=lambda p: p["area"], reverse=True)
        players = near[:2] + far[:2]
        player_regions = [tuple(p["bbox"]) for p in players]

        # --- SHUTTLECOCK DETECTION ---
        if self.shuttle_tracker is not None:
            visible, cx, cy = self.shuttle_tracker.update(frame)
            shuttles = []
            if visible:
                r = 12
                shuttles = [{"bbox": [cx - r, cy - r, cx + r, cy + r],
                             "center": [cx, cy], "conf": 1.0}]
        else:
            shuttles = self._mog2_detect(frame, player_regions, h, w)

        return {"shuttles": shuttles, "players": players}

    def _mog2_detect(self, frame, player_regions, h, w):
        fg_mask = self.bg_subtractor.apply(frame)
        for (x1, y1, x2, y2) in player_regions:
            fg_mask[y1:y2, x1:x2] = 0
        fg_mask[:int(0.25 * h), :] = 0
        fg_mask[int(0.95 * h):, :] = 0
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        shuttles = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 4 < area < 400:
                x, y, bw, bh = cv2.boundingRect(cnt)
                if bw < 45 and bh < 45:
                    cx, cy = x + bw // 2, y + bh // 2
                    shuttles.append({"bbox": [x, y, x + bw, y + bh],
                                     "center": [cx, cy], "conf": round(area / 400.0, 2)})
        shuttles.sort(key=lambda s: s["conf"], reverse=True)
        return shuttles[:5]


def test_on_video(video_path):
    detector = BadmintonDetector()
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"Could not open video: {video_path}")
        return

    frame_count = 0
    shuttle_detected_frames = 0
    detections = {"shuttles": [], "players": []}

    while cap.isOpened() and frame_count < 300:
        ret, frame = cap.read()
        if not ret:
            break

        detections = detector.detect_frame(frame)

        if detections["shuttles"]:
            shuttle_detected_frames += 1

        for s in detections["shuttles"][:1]:
            x1, y1, x2, y2 = s["bbox"]
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
            cv2.circle(frame, tuple(s["center"]), 8, (0, 255, 255), -1)

        for i, p in enumerate(detections["players"]):
            x1, y1, x2, y2 = p["bbox"]
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(frame, f"P{i+1}", (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.putText(frame,
                    f"Frame {frame_count} | Shuttle: {len(detections['shuttles'])} | Players: {len(detections['players'])}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.imshow("Badminton Detector — press Q to quit", frame)
        if cv2.waitKey(30) & 0xFF == ord('q'):
            break

        frame_count += 1

    cap.release()
    cv2.destroyAllWindows()
    print(f"\nResults over {frame_count} frames:")
    print(f"  Shuttle detected: {shuttle_detected_frames} frames ({100*shuttle_detected_frames//max(frame_count,1)}%)")
    print(f"  Players: up to {len(detections['players'])} per frame")


if __name__ == "__main__":
    video_path = input("Paste the full path to a badminton video file: ").strip().strip('"')
    test_on_video(video_path)
