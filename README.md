# ShuttleVision

Badminton match analytics desktop app. Upload a match video, get AI-powered tactical insights — shot heatmaps, rally stats, trajectory arcs, and Llama 3.3 70B coaching analysis.

Built with Electron + React + Python (TrackNetV2, YOLOv8, OpenCV).

---

## Features

- **Shuttle tracking** — TrackNetV2 deep learning model (no CSV needed)
- **Court detection** — HSV color segmentation + homography
- **7-tab dashboard** — Overview, Heatmap, Stats, Rallies, Trajectories, Video Player, AI Analysis
- **AI coaching** — Llama 3.3 70B via Groq (free API key)
- **Highlight export** — one-click clip extraction for any rally
- **Match history** — Firebase Firestore metadata sync per user account
- **YouTube download** — paste a URL, video downloads automatically

---

## Quick Start (Development)

### Prerequisites

- Node.js 18+
- Python 3.10+
- `C:\Users\swati\badminton_models\track.pt` — TrackNetV2 weights (45 MB)

### 1. Python backend

```powershell
cd badminton_app
python -m venv venv
venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
venv\Scripts\pip install ultralytics opencv-python yt-dlp numpy scipy
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

### 3. Groq API key (free)

1. Go to [console.groq.com](https://console.groq.com)
2. Create a free account → API Keys → Create key
3. In the app → Settings (gear icon) → paste key starting with `gsk_`

---

## Build (Windows installer)

```powershell
cd frontend
npm run dist:win
# Output: dist-release/ShuttleVision Setup 1.0.0.exe
```

The installer packages the Electron frontend only. The Python venv must exist at `badminton_app/venv/` on the target machine. Run `setup.bat` to set it up.

### Fully standalone build (optional, ~40 min)

```powershell
# Install PyInstaller then bundle the Python backend
venv\Scripts\pip install pyinstaller
cd backend
pyinstaller shuttlevision_backend.spec
# Copy dist/shuttlevision_backend/ to frontend/resources/python_backend/
# Then: npm run dist:win
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 31 |
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Shuttle tracking | TrackNetV2 (PyTorch, CPU) |
| Court detection | HSV segmentation + homography (OpenCV) |
| Player tracking | YOLOv8 (ultralytics) |
| AI coaching | Llama 3.3 70B via Groq SDK |
| Auth + DB | Firebase (Firestore, Spark free plan) |
| Video download | yt-dlp |

---

## Project Structure

```
badminton_app/
├── frontend/          ← Electron + React (npm project)
│   ├── src/main/      ← Electron main process + IPC
│   ├── src/preload/   ← contextBridge
│   └── src/renderer/  ← React UI (7 tabs)
├── backend/           ← Python pipeline
│   ├── run_analysis.py
│   ├── tracknet_tracker.py
│   ├── court_detector.py
│   ├── analytics.py
│   └── ...
└── downloads/         ← test assets (not tracked)
```
