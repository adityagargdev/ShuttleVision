# ShuttleVision — Project Context for Claude

Badminton match analytics desktop app. ML/CV resume project targeting SDE placements (Aug 2026).

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 31 |
| Frontend | React 18 + Vite (electron-vite) + Tailwind CSS + Recharts |
| Backend | Python 3.x (cv2, ultralytics YOLOv8, yt-dlp) |
| Shuttle detection | TrackNetV2 — weights at `C:\Users\swati\badminton_models\track.pt` (45MB); auto-runs if no CSV supplied |
| Court detection | HSV color segmentation → homography |
| AI coaching | Llama 3.3 70B via Groq SDK (npm) — free, no billing needed |
| Auth + DB | Firebase (Firestore only — Spark free plan, no Storage) |

## Key Paths

```
badminton_app/
├── frontend/                   ← npm project root (cd here for npm run dev)
│   ├── electron.vite.config.mjs
│   ├── package.json            ← has "type": "module" (needed for PostCSS)
│   ├── src/
│   │   ├── main/index.js       ← Electron main process + all IPC handlers + spawnPy helper
│   │   ├── preload/index.js    ← contextBridge (window.api)
│   │   └── renderer/src/
│   │       ├── firebase.js     ← Firebase init (auth + db only, no storage)
│   │       ├── App.jsx         ← auth gates, 7-tab shell, state, Firebase save logic
│   │       ├── components/
│   │       │   ├── LoginPage.jsx            ← email/password + Google Sign-In
│   │       │   ├── MatchHistory.jsx         ← per-user match history dashboard
│   │       │   ├── UploadPanel.jsx          ← file pickers, YouTube URL, analyze btn
│   │       │   └── tabs/
│   │       │       ├── OverviewTab.jsx
│   │       │       ├── HeatmapTab.jsx       ← handles both file:// and https:// paths
│   │       │       ├── StatsTab.jsx
│   │       │       ├── RallyBrowserTab.jsx
│   │       │       ├── TrajectoriesTab.jsx
│   │       │       ├── VideoTab.jsx         ← handles cloud-loaded matches gracefully
│   │       │       └── AIAnalysisTab.jsx
│   └── out/                    ← electron-vite build output (gitignored)
├── backend/
│   ├── run_analysis.py         ← entry point; outputs analysis.json + heatmap
│   ├── tracknet_tracker.py     ← TrackNetV2 PyTorch model + generate_predict_csv()
│   ├── shuttle_detector_cv.py  ← fallback OpenCV MOG2 detector (no model needed)
│   ├── csv_filter.py           ← velocity / stuck-cluster / isolated removal
│   ├── court_detector.py       ← HSV → homography → top-down mapping
│   ├── analytics.py            ← rally segmentation, zone stats, shot counts
│   ├── shot_classifier.py      ← smash/clear/drop/lift/drive/net
│   ├── trajectory_extractor.py ← arc extraction per rally
│   ├── player_tracker.py       ← YOLO player tracking (optional)
│   ├── highlight_extractor.py  ← OpenCV clip writer (no ffmpeg needed)
│   ├── extract_highlights_cli.py ← CLI wrapper for highlight_extractor
│   └── download_video.py       ← yt-dlp YouTube download with browser cookie fallback
├── venv/                       ← Python venv (torch + torchvision installed)
└── downloads/                  ← test assets
    ├── rally_test.mp4
    ├── rally_test_predict.csv
    └── analysis.json           ← saved output from last analysis run (use "Load saved analysis.json" to skip re-running)
```

## Python Venv

```
C:\Users\swati\OneDrive\Desktop\badminton_app\venv\Scripts\python.exe
```

Always use this path in `PYTHON` constant inside `src/main/index.js`. Never use `python` or `py` bare.

## Run Commands

```powershell
# Kill stale processes first (always do this before restarting)
taskkill /F /IM electron.exe
taskkill /F /IM python.exe

# Start dev server (from frontend/)
cd C:\Users\swati\OneDrive\Desktop\badminton_app\frontend
npm run dev
```

Backend analysis (standalone test, with CSV):
```powershell
& "C:\Users\swati\OneDrive\Desktop\badminton_app\venv\Scripts\python.exe" `
  "C:\Users\swati\OneDrive\Desktop\badminton_app\backend\run_analysis.py" `
  --video "C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4" `
  --predict-csv "C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test_predict.csv" `
  --out-dir "C:\Users\swati\OneDrive\Desktop\badminton_app\downloads"
```

Backend analysis (standalone test, auto TrackNetV2 — no CSV):
```powershell
& "C:\Users\swati\OneDrive\Desktop\badminton_app\venv\Scripts\python.exe" `
  "C:\Users\swati\OneDrive\Desktop\badminton_app\backend\run_analysis.py" `
  --video "C:\Users\swati\OneDrive\Desktop\badminton_app\downloads\rally_test.mp4" `
  --out-dir "C:\Users\swati\OneDrive\Desktop\badminton_app\downloads"
```

## Features Built

### Auth system (Firebase — Jul 10 2026)
- Firebase project: `shuttlevision-1005d` (Spark free plan)
- **Firestore only** — Firebase Storage skipped (requires Blaze/paid plan)
- `firebase.js` exports `auth` and `db` only (no `storage`)
- `LoginPage.jsx` — email/password + Google Sign-In (`signInWithPopup`)
- Email verification gate — new email/password signups must verify before accessing app
  - After signup: `sendEmailVerification(user)` called automatically
  - App.jsx checks `emailVerified` state; shows verification pending screen if false
  - "I've verified" button calls `auth.currentUser.reload()` then updates state
  - Google Sign-In bypasses this (Google accounts always pre-verified)
- `MatchHistory.jsx` — per-user dashboard showing all past matches from Firestore
- Groq API key scoped per user: `localStorage.getItem('geminiKey_${user.uid}')` (localStorage key name kept as-is)
- Google Sign-In popup allowed in Electron via `web-contents-created` handler in `main/index.js`

### Firebase data model (Firestore)
```
/users/{uid}/matches/{docId}
  videoName: string
  analyzedAt: Timestamp
  summary: { total_rallies, avg_rally_sec, max_rally_sec, total_shots, avg_speed_px_per_sec, max_speed_px_per_sec, duration_sec }
  localAnalysisPath: string   ← full path to analysis.json on this machine
  localHeatmapPath: string    ← full path to shuttle_heatmap.png on this machine
```
- Analysis data stays on local disk — Firestore is metadata index only
- Loading a past match reads from `localAnalysisPath` via `window.api.loadAnalysis`
- Cross-machine: history cards show (stats visible), but "Open" shows "file not found" message
- Delete removes Firestore doc only (local files untouched)

### App.jsx auth flow
```
authLoading → spinner
!user → LoginPage
user && !emailVerified → verification pending screen
user && view === 'history' → MatchHistory
user && view === 'app' → main analysis UI
```
- After analysis completes: `uploadToFirebase(result)` saves metadata to Firestore (fire-and-forget)
- Header shows "Saving to cloud…" → "✓ Saved" indicator
- "← My Matches" button in header returns to history, clears current analysis

### Backend pipeline (`run_analysis.py`)
Prints `STEP:N:description` lines to stdout for progress streaming.

0. TrackNetV2 auto-detection — if no `--predict-csv` supplied, runs `generate_predict_csv()` on the full video; saves to `out_dir/tracknet_predict.csv`
1. Video metadata — reads fps, resolution, duration via cv2
2. CSV filtering — removes stuck-cluster, isolated, and high-velocity noise detections
3. Analytics + heatmap — rally segmentation, zone dwell times, speed stats; writes `shuttle_heatmap.png`
4. Shot classification — rule-based on trajectory angle + speed (smash/clear/drop/lift/drive/net)
5. Trajectory arc extraction — one arc object per rally
6. Speed histogram — bins shuttle speeds across all rallies
7. Court boundary detection — HSV line segmentation → perspective homography → corner coords
8. Player tracking — YOLOv8 (optional, `--track-players` flag); writes player heatmap
9. Compile + write `analysis.json` to `--out-dir`; prints `DONE:path/to/analysis.json`

### TrackNetV2 auto-detection (`tracknet_tracker.py`)
- `generate_predict_csv(video_path, out_csv, progress_fn=None, stride=5)`
- Loads `C:\Users\swati\badminton_models\track.pt` (45MB, PyTorch)
- Runs inference every `stride` frames — 5x speedup on CPU
- Runs on CPU (no CUDA on this machine); ~15-30 min for an 8-min clip at stride=5

### `analysis.json` structure
```json
{
  "meta": { "video_path": "...", "out_dir": "...", "fps": 30 },
  "summary": { "duration_sec", "total_rallies", "avg_rally_sec", "max_rally_sec", "total_shots", "avg_speed_px_per_sec", "max_speed_px_per_sec", "court_corners": [[x,y],...] },
  "rallies": [ { "id", "start_sec", "end_sec", "duration_sec", "shuttle_frames", "avg_speed_px", "max_speed_px" } ],
  "heatmap_path": "...",
  "shot_zones": { "near_left": { "pct" }, ... },
  "shot_type_counts": { "smash": N, ... },
  "shot_pattern": { "left_pct", "center_pct", "right_pct" },
  "trajectories": [ { "rally_id", "xs": [], "ys": [] } ],
  "shots": [ { "rally_id", "frame", "x", "y", "type", "speed" } ],
  "speed_histogram": { "labels": [], "counts": [] },
  "player_data": null | { ... },
  "player_heatmap_path": null | "...",
  "_cloudLoaded": true   ← only present when loaded from Firestore (not local run)
}
```

### Frontend tabs
| Tab | What it shows |
|---|---|
| Overview | Summary cards + rally length chart + zone activity chart + shot placement bar |
| Heatmap | Shuttle heatmap (supports both `file://` local and `https://` cloud URLs) |
| Stats | Speed histogram + shot type pie chart + per-rally speed chart |
| Rallies | Selectable rally list + detail panel + "Watch in Video Player" |
| Trajectories | Canvas arc overlay + color-coded shot events, filterable by rally |
| Video Player | HTML5 video + rally timeline + jump grid + highlight export; shows cloud message if `_cloudLoaded` |
| AI Analysis | Llama 3.3 70B (Groq) chat with quick prompts + follow-up Q&A; "? How to use" button opens full instructions modal |

### AI Analysis tab (AIAnalysisTab.jsx)
- "? How to use" button (top-right) opens `HelpModal` — covers: what it does, 4-step Groq key setup, sample questions, tips
- No-key yellow banner links to the same modal for detailed instructions
- Error message refers to "Groq API key" (not Gemini)
- `localStorage` key name is still `geminiKey_${uid}` (legacy, do not rename — would break existing installs)

### Onboarding screen (App.jsx)
- Shown on first login per user — tracked via `localStorage.getItem('onboarded_${uid}')`
- Renders as a modal overlay on top of the MatchHistory view
- Content: welcome message, 3-step flow cards (Upload → Analyze → AI Insights), Groq key setup note
- "Let's get started →" sets `onboarded_${uid}` in localStorage and dismisses permanently
- New users see it automatically; existing users see it once on the next launch after the code was added

### YouTube download (`download_video.py`)
- Format: `22/18/best[ext=mp4]/best` — prefers pre-merged progressive streams (no ffmpeg needed)
  - Format 22 = 720p mp4, Format 18 = 360p mp4, both always pre-merged
- Browser cookie fallback order: Edge → Chrome → Firefox → no cookies
  - Edge/Chrome fail if browser is open (DB locked); Firefox usually succeeds
- `windowsfilenames: True` — sanitizes video titles with `:`, `|`, `?` etc.
- All Python subprocesses spawned with `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` to handle Unicode video titles on Windows
- **ffmpeg is NOT installed** — do not use formats requiring merging

### Process management (`main/index.js`)
- `spawnPy(args)` helper — wraps `spawn(PYTHON, args, { env: PY_ENV })` with UTF-8 env vars
- `PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }`
- `_activeAnalysis` tracks running Python subprocess; new analysis kills previous one
- `cancel-analysis` IPC handler sends SIGKILL on demand
- `web-contents-created` handler allows Firebase auth popup windows (Google Sign-In)

### IPC bridge (`src/preload/index.js` → `window.api`)
```js
window.api = {
  selectVideo, selectCsv, selectOutDir,
  selectAnalysisJson,          // ← new: file picker for existing analysis.json (skips re-analysis)
  runAnalysis, cancelAnalysis, loadAnalysis,
  askClaude,
  downloadVideo, exportHighlights, openFile,
  onProgress, onHighlightProgress, onDownloadProgress,
}
```

### Highlight export (VideoTab.jsx)
- "Export N clips" → `window.api.exportHighlights` → `extract_highlights_cli.py` → `highlight_extractor.py`
- Uses `cv2.VideoCapture` + `cv2.VideoWriter` (no ffmpeg)
- Disabled when `_cloudLoaded` (video not available locally)

### Video player (VideoTab.jsx)
- HTML5 `<video src="file:///path">` — works because `webSecurity: false`
- Rally timeline: colored bars, click to seek
- Seek intent pattern: `{ time, key: Date.now() }` — key changes so same timestamp can be clicked twice
- Cloud-loaded matches: shows "Video not available" message instead of broken player

## Critical Build Quirk — Preload CJS Fix

`package.json` has `"type": "module"` (required for PostCSS).
Electron cannot load `.mjs` as a preload script.

**Fix in `electron.vite.config.mjs`:**
```js
preload: {
  build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.js' } } }
}
```
✅ Confirmed working as of Jul 9 2026.

## Known Issues / Status

- **Auth**: working — email/password + Google Sign-In + email verification ✅
- **Match history**: working — Firestore save after analysis, load from local disk ✅
- **YouTube download**: working — uses Firefox cookies + format 22/18 (no ffmpeg) ✅
- **AI Analysis**: working — Groq (Llama 3.3 70B), user enters free Groq key in Settings ✅
- **AI instructions modal**: working — "? How to use" in AI Analysis tab ✅
- **Onboarding screen**: working — first-launch modal per user ✅
- **Load saved analysis.json**: working — skips Python re-run entirely ✅
- **Highlight export**: working — tested end-to-end with rally_test.mp4, exported 6 clips ✅
- **Packaging (electron-builder)**: configured — run `npm run dist:win` to build NSIS installer ✅
- **Blank window on launch**: FIXED ✅
- **TrackNetV2 on CPU**: stride=5 gives 5x speedup; ~15-30 min for 8-min clip
- **ffmpeg**: NOT installed — yt-dlp uses pre-merged formats only; highlight export uses cv2
- **Python not bundled**: packaged `.exe` requires Python venv at the hardcoded path; for a fully standalone build, use PyInstaller to bundle the backend separately

## External Dependencies

| Package | Purpose | Notes |
|---|---|---|
| yt-dlp | YouTube download | In venv; uses Firefox cookies to bypass bot detection |
| firebase (npm) | Auth + Firestore | Spark plan (free); Storage NOT enabled |
| ultralytics | YOLOv8 player tracking | In venv |
| opencv-python (cv2) | Video processing, highlight export | In venv |
| torch + torchvision | TrackNetV2 inference | In venv |
| groq-sdk (npm) | Llama 3.3 70B for AI Analysis tab | Replaced @google/generative-ai; free tier, no billing |
| @anthropic-ai/sdk (npm) | installed but unused | kept in package.json |
| electron-builder (npm) | packaging to .exe | devDependency; outputs to `dist-release/` |

## Packaging (electron-builder)

```powershell
# Build NSIS installer (.exe) for Windows x64
cd C:\Users\swati\OneDrive\Desktop\badminton_app\frontend
npm run dist:win
# Output: dist-release/ShuttleVision Setup 1.0.0.exe
```

- `package.json` `build` config: appId `com.shuttlevision.app`, NSIS target, output to `dist-release/`
- Scripts: `dist` (cross-platform), `dist:win` (Windows x64 only)
- Packages only the Electron frontend — Python venv must exist at its hardcoded path on the target machine
- No app icon configured yet — uses default Electron icon; add `resources/icon.ico` and set `win.icon` in `package.json` to use a custom one

## Session Log — Jul 13 2026

### What was done (session 1)
1. **AI Analysis tab fixed end-to-end**
   - Removed `apiKey.startsWith('AIza')` check — now accepts any non-empty key
   - Fixed early-return bug in `ask()` (`q !== null` instead of `!(!q)`)
   - Settings panel now shows "✓ Saved" flash on every keystroke; Enter closes panel
   - Switched AI backend from Gemini (`@google/generative-ai`) → Groq (`groq-sdk`)
   - Model: `llama-3.3-70b-versatile` — free tier, no billing, 14,400 req/day
   - Friendly error messages for 401/429 instead of raw Google error dumps

2. **"Load saved analysis.json" button added to UploadPanel**
   - New IPC handler: `select-analysis-json` (file picker filtered to `.json`)
   - New preload entry: `window.api.selectAnalysisJson()`
   - New callback `handleLoadAnalysisJson` in App.jsx sets analysis state + `status='done'`
   - Lets user skip the entire Python pipeline when `analysis.json` already exists on disk

3. **Groq key onboarding instructions added**
   - AI Analysis tab: 4-step guide visible when no key is set
   - Settings panel: compact 3-step guide visible while key input is empty
   - Placeholder updated to `gsk_...`

### What was done (session 2 — Jul 13 2026)
1. **Highlight export verified working** — tested end-to-end with `rally_test.mp4`, exported 6 clips successfully

2. **Firestore save bug fixed** — `court_corners: [[x,y],...]` in `summary` caused `addDoc()` to throw "Nested arrays are not supported". Fixed by destructuring it out before saving: `const { court_corners, ...summaryToSave } = result.summary`

3. **Match history round-trip verified working** — analysis saves to Firestore after run, match appears in My Matches, "Open Match →" loads from `localAnalysisPath` without re-running Python

4. **AI instructions modal added** — `HelpModal` component in `AIAnalysisTab.jsx`; "? How to use" button always visible in tab header; covers what it does, Groq key setup steps, sample questions, tips

5. **Onboarding screen added** — first-launch modal in `App.jsx`; shown once per user (tracked via `localStorage.getItem('onboarded_${uid}')`); covers 3-step app flow + Groq key setup

6. **Packaging configured** — `electron-builder` installed, `dist:win` script added, NSIS build config in `package.json`

### Where to pick up next session
- **Custom app icon** — create/add `resources/icon.ico` and wire it into `package.json` build config before distributing
- **Python bundling** — for a truly standalone installer, use PyInstaller to bundle `run_analysis.py` + venv into a single `.exe` and reference it from `main/index.js` instead of the venv path
- **Open "Open Match →"** in My Matches — verified correct in code; user should do a quick manual test
