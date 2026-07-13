# ShuttleVision

**Badminton match analytics desktop app** — upload a match video or paste a YouTube URL to get a full tactical breakdown: shuttle heatmaps, rally segmentation, shot classification, trajectory arcs, speed analysis, and AI coaching powered by Llama 3.3 70B.

Built with Electron + React + Python (TrackNetV2, YOLOv8, OpenCV) as a CV/ML portfolio project.

> **Download:** [ShuttleVision v1.0.0 — Windows installer](https://github.com/adityagargdev/ShuttleVision/releases/tag/v1.0.0)

---

## Features

- **Shuttle tracking** — TrackNetV2 deep learning model detects the shuttlecock frame-by-frame; OpenCV MOG2 fallback if weights are unavailable
- **Court detection** — HSV color segmentation → perspective homography → top-down court mapping
- **Rally segmentation** — automatic rally detection with per-rally duration, speed, and shot counts
- **Shot classification** — rule-based classifier labels each shot: smash / clear / drop / lift / drive / net
- **Heatmap** — 2D density map of shuttle positions across the full match
- **Trajectory overlay** — color-coded arc per rally on an interactive canvas, filterable by rally
- **Speed analysis** — shuttle speed histogram and per-rally speed breakdown
- **Video player** — HTML5 player with rally timeline, click-to-seek, and highlight clip export (no ffmpeg required)
- **AI coaching** — Llama 3.3 70B (Groq free tier) answers questions about your match data with context-aware analysis
- **YouTube download** — paste any YouTube URL; the app downloads the video and runs the full pipeline
- **Match history** — Firebase-backed per-user dashboard; re-open past matches without re-running analysis
- **Auth** — email/password + Google Sign-In, with email verification gate for new accounts

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 31 |
| Frontend | React 18 + Vite (electron-vite) + Tailwind CSS + Recharts |
| Backend | Python 3.x |
| Shuttle detection | TrackNetV2 (PyTorch, CPU inference) |
| Court detection | OpenCV HSV segmentation + homography |
| Player tracking | YOLOv8 (ultralytics) — optional |
| Video download | yt-dlp |
| AI coaching | Llama 3.3 70B via Groq SDK (free tier) |
| Auth + DB | Firebase Auth + Firestore (Spark free plan) |

---

## Dashboard Tabs

| Tab | Contents |
|---|---|
| Overview | Summary cards, rally length chart, zone activity chart, shot placement bar |
| Heatmap | Shuttle density map |
| Stats | Speed histogram, shot type pie chart, per-rally speed chart |
| Rallies | Selectable rally list with detail panel and "Watch in Video Player" |
| Trajectories | Canvas arc overlay, color-coded by shot type, filterable by rally |
| Video Player | HTML5 player, rally timeline scrubber, click-to-seek, highlight clip export |
| AI Analysis | Llama 3.3 70B chat with quick-prompt buttons and follow-up Q&A |

---

## Project Structure

```
badminton_app/
├── frontend/                        ← npm project (Electron + React)
│   ├── src/
│   │   ├── main/index.js            ← Electron main process + all IPC handlers
│   │   ├── preload/index.js         ← contextBridge (window.api)
│   │   └── renderer/src/
│   │       ├── App.jsx              ← auth gates, 7-tab shell, Firebase save logic
│   │       ├── firebase.js          ← Firebase init (auth + Firestore)
│   │       └── components/
│   │           ├── LoginPage.jsx
│   │           ├── MatchHistory.jsx
│   │           ├── UploadPanel.jsx
│   │           └── tabs/            ← one file per tab
│   └── resources/
│       └── icon.ico
└── backend/
    ├── run_analysis.py              ← pipeline entry point; outputs analysis.json + heatmap
    ├── tracknet_tracker.py          ← TrackNetV2 PyTorch model + CSV generation
    ├── shuttle_detector_cv.py       ← OpenCV MOG2 fallback detector
    ├── csv_filter.py                ← velocity / cluster / isolated noise removal
    ├── court_detector.py            ← HSV → homography → top-down court mapping
    ├── analytics.py                 ← rally segmentation, zone stats, speed stats
    ├── shot_classifier.py           ← smash / clear / drop / lift / drive / net
    ├── trajectory_extractor.py      ← arc extraction per rally
    ├── player_tracker.py            ← YOLOv8 player tracking (optional)
    ├── highlight_extractor.py       ← OpenCV clip writer (no ffmpeg)
    ├── extract_highlights_cli.py    ← CLI wrapper
    └── download_video.py            ← yt-dlp with browser cookie fallback
```

---

## Setup (Development)

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+
- TrackNetV2 weights: `track.pt` (45 MB) — download separately and place at a known path
  - Without the weights file the app automatically falls back to the OpenCV MOG2 detector
- A free [Groq account](https://console.groq.com) for AI coaching
- A Firebase project (Spark free plan) with Auth and Firestore enabled

### 1. Clone and install frontend dependencies

```bash
git clone https://github.com/adityagargdev/ShuttleVision.git
cd ShuttleVision/frontend
npm install
```

### 2. Set up Python virtual environment

```powershell
cd ..   # back to badminton_app/
python -m venv venv
venv\Scripts\activate

# CPU-only PyTorch (recommended unless you have CUDA set up)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install ultralytics opencv-python yt-dlp numpy pillow
```

### 3. Configure the Python path

Open `frontend/src/main/index.js` and update the `PYTHON` constant to your venv:

```js
const PYTHON = 'C:\\path\\to\\badminton_app\\venv\\Scripts\\python.exe'
```

Also update the TrackNetV2 weights path in `backend/tracknet_tracker.py` if it differs from the default.

### 4. Configure Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password + Google providers
3. Enable **Firestore Database** (start in test mode)
4. Copy your Firebase config object into `frontend/src/renderer/src/firebase.js`

### 5. Run the app

```powershell
# Kill any stale processes first
taskkill /F /IM electron.exe
taskkill /F /IM python.exe

cd frontend
npm run dev
```

The Electron window opens. Sign in, then upload a video or paste a YouTube URL and click **Analyze**.

---

## AI Coaching Setup

1. Go to [console.groq.com](https://console.groq.com) → create a free account → **API Keys** → Create key
2. In the app: click the **Settings** gear → paste your key (starts with `gsk_`)
3. Open the **AI Analysis** tab and ask anything about your match

The Groq free tier offers 14,400 requests/day — plenty for personal use.

---

## Backend Pipeline

The backend streams progress to the UI via `STEP:N:description` lines on stdout.

| Step | What happens |
|---|---|
| 0 | TrackNetV2 auto-detection — inference every 5th frame (5× speedup on CPU); saves `tracknet_predict.csv` |
| 1 | Read video metadata (fps, resolution, duration) via OpenCV |
| 2 | Filter raw detections — remove stuck clusters, isolated points, supersonic velocity jumps |
| 3 | Rally segmentation + zone dwell stats + shuttle heatmap PNG |
| 4 | Shot classification per frame (smash / clear / drop / lift / drive / net) |
| 5 | Trajectory arc extraction — one arc object per rally |
| 6 | Speed histogram across all rallies |
| 7 | Court boundary detection → perspective homography → corner coordinates |
| 8 | YOLOv8 player tracking (only with `--track-players` flag) |
| 9 | Compile and write `analysis.json` to `--out-dir` |

### Test the pipeline standalone

```powershell
# With a pre-computed tracking CSV (fast)
& "venv\Scripts\python.exe" backend\run_analysis.py `
  --video "downloads\rally_test.mp4" `
  --predict-csv "downloads\rally_test_predict.csv" `
  --out-dir "downloads"

# Full auto-detection via TrackNetV2 (slow on CPU: ~15-30 min per 8-min clip)
& "venv\Scripts\python.exe" backend\run_analysis.py `
  --video "downloads\rally_test.mp4" `
  --out-dir "downloads"
```

---

## Firebase Data Model

Analysis data lives on local disk. Firestore stores only lightweight metadata for the match history dashboard.

```
/users/{uid}/matches/{docId}
  videoName:          string
  analyzedAt:         Timestamp
  summary:            { total_rallies, avg_rally_sec, max_rally_sec, total_shots,
                        avg_speed_px_per_sec, max_speed_px_per_sec, duration_sec }
  localAnalysisPath:  string   ← full path to analysis.json on this machine
  localHeatmapPath:   string   ← full path to shuttle_heatmap.png on this machine
```

Opening a past match from the history dashboard reads `analysis.json` from `localAnalysisPath` via IPC — no cloud storage or uploads required.

---

## Building the Installer

```powershell
cd frontend
npm run dist:win
# Output: dist-release/ShuttleVision Setup 1.0.0.exe
```

The NSIS installer packages the Electron frontend only. The Python venv must exist at the configured path on the target machine.

### Optional: fully standalone PyInstaller build

```powershell
venv\Scripts\pip install pyinstaller
cd backend
pyinstaller shuttlevision_backend.spec
# Then copy dist/shuttlevision_backend/ into frontend/resources/python_backend/
# And run: npm run dist:win
```

---

## Known Limitations

- **CPU-only inference** — TrackNetV2 runs on CPU (~15–30 min per 8-min clip at stride=5). Install a CUDA-enabled torch wheel to enable GPU acceleration.
- **No ffmpeg** — YouTube download uses pre-merged progressive streams (720p/360p). Formats that require audio+video merging are skipped.
- **Python not bundled** — the default installer requires the Python venv at its configured path. Use the PyInstaller spec above for a self-contained binary.
- **Local video for playback** — the match history dashboard shows stats and heatmap for any past match, but the video player and highlight export require the original video file on the current machine.

---

## License

MIT
