import torch
import torchvision
import cv2
import numpy as np
from torch import nn
from pathlib import Path

WEIGHTS_PATH = Path("C:/Users/swati/badminton_models/track.pt")
INPUT_SIZE = (288, 512)  # (height, width) — TrackNetV2 expected input


class _Conv(nn.Module):
    """Conv2d + ReLU + BatchNorm with TF-converted channel-last BN order."""
    def __init__(self, ic, oc, bc, k=(3, 3), p="same"):
        super().__init__()
        self.conv = nn.Conv2d(ic, oc, kernel_size=k, padding=p)
        self.bn = nn.BatchNorm2d(bc)
        self.act = nn.ReLU()

    def forward(self, x):
        x = self.act(self.conv(x))
        x = x.transpose(1, 3)  # NCHW → NWHC (TF channel-last BN)
        x = self.bn(x)
        x = x.transpose(1, 3)  # NWHC → NCHW
        return x


class _TrackNet(nn.Module):
    """TrackNetV2 architecture with tf2torch-compatible BatchNorm dimensions."""
    def __init__(self):
        super().__init__()
        # VGG16 encoder — input is 3 RGB frames stacked = 9 channels
        self.conv2d_1  = _Conv(9,   64,  512)
        self.conv2d_2  = _Conv(64,  64,  512)
        self.max_pooling_1 = nn.MaxPool2d((2, 2), stride=(2, 2))

        self.conv2d_3  = _Conv(64,  128, 256)
        self.conv2d_4  = _Conv(128, 128, 256)
        self.max_pooling_2 = nn.MaxPool2d((2, 2), stride=(2, 2))

        self.conv2d_5  = _Conv(128, 256, 128)
        self.conv2d_6  = _Conv(256, 256, 128)
        self.conv2d_7  = _Conv(256, 256, 128)
        self.max_pooling_3 = nn.MaxPool2d((2, 2), stride=(2, 2))

        self.conv2d_8  = _Conv(256, 512, 64)
        self.conv2d_9  = _Conv(512, 512, 64)
        self.conv2d_10 = _Conv(512, 512, 64)

        # U-Net decoder with skip connections
        self.up_sampling_1 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_11 = _Conv(768, 256, 128)
        self.conv2d_12 = _Conv(256, 256, 128)
        self.conv2d_13 = _Conv(256, 256, 128)

        self.up_sampling_2 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_14 = _Conv(384, 128, 256)
        self.conv2d_15 = _Conv(128, 128, 256)

        self.up_sampling_3 = nn.UpsamplingNearest2d(scale_factor=2)
        self.conv2d_16 = _Conv(192, 64,  512)
        self.conv2d_17 = _Conv(64,  64,  512)
        self.conv2d_18 = nn.Conv2d(64, 3, kernel_size=(1, 1), padding="same")

    def forward(self, x):
        x = self.conv2d_1(x)
        x1 = self.conv2d_2(x)
        x = self.max_pooling_1(x1)

        x = self.conv2d_3(x)
        x2 = self.conv2d_4(x)
        x = self.max_pooling_2(x2)

        x = self.conv2d_5(x)
        x = self.conv2d_6(x)
        x3 = self.conv2d_7(x)
        x = self.max_pooling_3(x3)

        x = self.conv2d_8(x)
        x = self.conv2d_9(x)
        x = self.conv2d_10(x)

        x = self.up_sampling_1(x)
        x = torch.cat([x, x3], dim=1)
        x = self.conv2d_11(x)
        x = self.conv2d_12(x)
        x = self.conv2d_13(x)

        x = self.up_sampling_2(x)
        x = torch.cat([x, x2], dim=1)
        x = self.conv2d_14(x)
        x = self.conv2d_15(x)

        x = self.up_sampling_3(x)
        x = torch.cat([x, x1], dim=1)
        x = self.conv2d_16(x)
        x = self.conv2d_17(x)
        x = self.conv2d_18(x)

        return torch.sigmoid(x)


def _extract_position(heatmap_uint8):
    """Find shuttlecock center from thresholded heatmap (0/255 image)."""
    if heatmap_uint8.max() == 0:
        return False, 0, 0
    contours, _ = cv2.findContours(heatmap_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return False, 0, 0
    rects = [cv2.boundingRect(c) for c in contours]
    best = max(rects, key=lambda r: r[2] * r[3])  # largest bounding box = shuttle
    cx = best[0] + best[2] // 2
    cy = best[1] + best[3] // 2
    return True, cx, cy


class TrackNetTracker:
    """
    Per-frame shuttlecock tracker using TrackNetV2 pretrained weights.
    Call update(frame) each frame; returns (visible, x, y) in original frame coords.
    Needs 3 frames to warm up — returns (False, 0, 0) for first 2 frames.
    """

    def __init__(self, weights_path=WEIGHTS_PATH):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        model = _TrackNet()
        try:
            state = torch.load(str(weights_path), map_location=self.device, weights_only=False)
        except TypeError:
            state = torch.load(str(weights_path), map_location=self.device)
        model.load_state_dict(state)
        model.eval()
        self.model = model.to(self.device)
        self._buffer = []
        print(f"[TrackNetV2] loaded on {self.device}", flush=True)

    def update(self, frame):
        """Feed one BGR frame. Returns (visible, x, y) in original frame coordinates."""
        self._buffer.append(frame)
        if len(self._buffer) > 3:
            self._buffer.pop(0)
        if len(self._buffer) < 3:
            return False, 0, 0

        h, w = frame.shape[:2]
        to_tensor = torchvision.transforms.ToTensor()
        tensors = []
        for img in self._buffer:
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            t = to_tensor(rgb)
            try:
                t = torchvision.transforms.functional.resize(t, INPUT_SIZE, antialias=True)
            except TypeError:
                t = torchvision.transforms.functional.resize(t, INPUT_SIZE)
            tensors.append(t)

        inp = torch.cat(tensors, dim=0).unsqueeze(0).to(self.device)  # [1, 9, 288, 512]

        with torch.no_grad():
            preds = self.model(inp)[0].cpu().numpy()  # [3, 288, 512]

        # use prediction for the newest (3rd) frame
        hmap = (preds[2] > 0.5).astype(np.uint8) * 255
        visible, cx_m, cy_m = _extract_position(hmap)
        if not visible:
            return False, 0, 0

        # scale from model space (512×288) back to original frame size
        cx = int(cx_m * w / INPUT_SIZE[1])
        cy = int(cy_m * h / INPUT_SIZE[0])
        return True, cx, cy

    def reset(self):
        self._buffer.clear()


def generate_predict_csv(video_path, out_csv, progress_fn=None, stride=5):
    """
    Run TrackNetV2 on video_path and write a CSV with columns:
    frame_num, visible, x, y  (same format as the external TrackNet predict CSV).

    stride: run model inference every N frames. Skipped frames are written as
    visible=0. stride=5 gives a 5x speedup with no meaningful loss for rally
    detection (shuttlecock moves fast enough that every 5th frame still traces
    full trajectories at 30fps → effective 6fps detection rate).

    progress_fn(frame_num, total) is called every 100 frames if provided.
    """
    import cv2
    import pandas as pd

    print("INFO:Loading TrackNetV2 model weights…", flush=True)
    tracker = TrackNetTracker()
    cap = cv2.VideoCapture(str(video_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"INFO:Model ready. Detecting on every {stride}th frame ({total} total)…", flush=True)
    rows = []
    frame_num = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_num % stride == 0:
            visible, x, y = tracker.update(frame)
        else:
            # Keep the rolling buffer current without running inference
            tracker._buffer.append(frame)
            if len(tracker._buffer) > 3:
                tracker._buffer.pop(0)
            visible, x, y = False, 0, 0

        rows.append({"frame_num": frame_num, "visible": 1 if visible else 0, "x": x, "y": y})
        frame_num += 1
        if progress_fn and frame_num % 100 == 0:
            progress_fn(frame_num, total)

    cap.release()
    pd.DataFrame(rows).to_csv(str(out_csv), index=False)
    print(f"INFO:TrackNetV2 done — {sum(r['visible'] for r in rows)}/{frame_num} detections saved", flush=True)
    return str(out_csv)
