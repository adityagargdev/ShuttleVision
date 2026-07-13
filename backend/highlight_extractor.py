"""Extract short video clips for each detected rally."""

import cv2
import os


def extract_highlights(video_path, rallies, out_dir, fps=30, padding_sec=0.5):
    """
    Cut one mp4 clip per rally with padding_sec on each side.
    Returns list of {rally_id, clip_path, duration_sec}
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    pad = int(padding_sec * fps)
    clips = []

    for rally in rallies:
        start = max(0, rally['start_frame'] - pad)
        end = min(total - 1, rally['end_frame'] + pad)
        n = end - start + 1

        clip_path = os.path.join(str(out_dir), f"rally_{rally['id'] + 1:02d}.mp4")
        writer = cv2.VideoWriter(clip_path, fourcc, fps, (w, h))

        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        for _ in range(n):
            ret, frame = cap.read()
            if not ret:
                break
            writer.write(frame)
        writer.release()

        clips.append({
            'rally_id': rally['id'],
            'clip_path': clip_path,
            'duration_sec': round(n / fps, 2),
        })

    cap.release()
    return clips
