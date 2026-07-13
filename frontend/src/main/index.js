import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import Groq from 'groq-sdk'

// Dev paths (absolute, your machine)
const DEV_PYTHON  = 'C:/Users/swati/OneDrive/Desktop/badminton_app/venv/Scripts/python.exe'
const DEV_BACKEND = 'C:/Users/swati/OneDrive/Desktop/badminton_app/backend'

// When packaged, electron-builder copies backend/*.py to resources/backend/
// and users are expected to set up a venv at resources/venv/ via setup.bat
function resolvePaths() {
  if (!app.isPackaged) return { python: DEV_PYTHON, backend: DEV_BACKEND }

  const resDir = process.resourcesPath
  const candidates = [
    join(resDir, 'venv', 'Scripts', 'python.exe'),      // venv next to app
    join(resDir, '..', 'venv', 'Scripts', 'python.exe'), // one level up
  ]
  const python = candidates.find(existsSync) || DEV_PYTHON
  const backend = join(resDir, 'backend')
  return { python, backend }
}

const { python: PYTHON, backend: BACKEND } = resolvePaths()
const PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }

const spawnPy = (args) => spawn(PYTHON, args, { env: PY_ENV })

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0d0d1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow loading local images
    },
    titleBarStyle: 'default',
    show: false,
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// Allow Firebase Google Sign-In popup windows through Electron's security sandbox
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl = url.includes('accounts.google.com') ||
                      url.includes('firebaseapp.com') ||
                      url.includes('googleapis.com')
    return { action: isAuthUrl ? 'allow' : 'deny' }
  })
})

// ── File dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('select-video', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select match video',
    filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('select-csv', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select TrackNet predict CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('select-out-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select output folder',
    properties: ['openDirectory'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('select-analysis-json', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open saved analysis.json',
    filters: [{ name: 'Analysis JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

// ── Analysis pipeline ─────────────────────────────────────────────────────────

let _activeAnalysis = null

ipcMain.handle('cancel-analysis', () => {
  if (_activeAnalysis) {
    _activeAnalysis.kill('SIGKILL')
    _activeAnalysis = null
  }
})

ipcMain.handle('run-analysis', (event, { videoPath, csvPath, outDir, trackPlayers }) => {
  // Kill any previous run before starting a new one
  if (_activeAnalysis) {
    _activeAnalysis.kill('SIGKILL')
    _activeAnalysis = null
  }

  return new Promise((resolve, reject) => {
    const args = [
      join(BACKEND, 'run_analysis.py'),
      '--video', videoPath,
      '--out-dir', outDir,
    ]
    if (csvPath) args.push('--predict-csv', csvPath)
    if (trackPlayers) args.push('--track-players')

    const py = spawnPy(args)
    _activeAnalysis = py

    py.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      lines.forEach(line => {
        event.sender.send('analysis-progress', line)
        if (line.startsWith('DONE:')) {
          const jsonPath = line.replace('DONE:', '').trim()
          try {
            const analysis = JSON.parse(readFileSync(jsonPath, 'utf-8'))
            _activeAnalysis = null
            resolve(analysis)
          } catch (e) {
            reject(new Error('Failed to parse analysis.json: ' + e.message))
          }
        }
      })
    })

    py.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg) event.sender.send('analysis-progress', 'LOG:' + msg)
    })

    py.on('error', (err) => { _activeAnalysis = null; reject(err) })
    py.on('close', (code) => {
      _activeAnalysis = null
      if (code !== 0 && code !== null) reject(new Error(`Python exited with code ${code}`))
    })
  })
})

// ── Load existing analysis ────────────────────────────────────────────────────

ipcMain.handle('load-analysis', (_, jsonPath) => {
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf-8'))
  } catch {
    return null
  }
})

// ── YouTube download ──────────────────────────────────────────────────────────

ipcMain.handle('download-video', (event, { url, outDir }) => {
  return new Promise((resolve, reject) => {
    const py = spawnPy([join(BACKEND, 'download_video.py'), '--url', url, '--out-dir', outDir])
    let lastPyError = ''

    py.stdout.on('data', (data) => {
      data.toString('utf8').split('\n').filter(Boolean).forEach(line => {
        event.sender.send('download-progress', line)
        if (line.startsWith('DONE:')) resolve(line.replace('DONE:', '').trim())
        if (line.startsWith('ERROR:')) lastPyError = line.replace('ERROR:', '').trim()
      })
    })
    py.stderr.on('data', (data) => {
      const msg = data.toString('utf8').trim()
      const isCookieNoise = /could not copy|cookie.?database|7271/i.test(msg)
      if (msg && !isCookieNoise) event.sender.send('download-progress', 'LOG:' + msg)
    })
    py.on('error', reject)
    py.on('close', (code) => {
      if (code !== 0) reject(new Error(lastPyError || `Download failed (exit ${code})`))
    })
  })
})

// ── Highlight extraction ──────────────────────────────────────────────────────

ipcMain.handle('export-highlights', (event, { videoPath, analysisJsonPath, outDir }) => {
  return new Promise((resolve, reject) => {
    const args = [
      join(BACKEND, 'extract_highlights_cli.py'),
      '--video', videoPath,
      '--analysis-json', analysisJsonPath,
      '--out-dir', outDir,
    ]
    const py = spawnPy(args)
    const clips = []

    py.stdout.on('data', (data) => {
      data.toString().split('\n').filter(Boolean).forEach(line => {
        event.sender.send('highlight-progress', line)
        if (line.startsWith('CLIP:')) clips.push(line.replace('CLIP:', '').trim())
      })
    })
    py.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg) event.sender.send('highlight-progress', 'LOG:' + msg)
    })
    py.on('error', reject)
    py.on('close', (code) => {
      if (code === 0) resolve(clips)
      else reject(new Error(`Highlight export failed (exit ${code})`))
    })
  })
})

ipcMain.handle('open-file', (_, filePath) => shell.openPath(filePath))

// ── Gemini AI analysis ────────────────────────────────────────────────────────

ipcMain.handle('ask-claude', async (_, { apiKey, analysis, question }) => {
  try {
    const groq = new Groq({ apiKey })

    const summary = analysis.summary
    const zones = analysis.shot_zones
    const typeCounts = analysis.shot_type_counts || {}
    const rallies = analysis.rallies || []
    const shortRallies = rallies.filter(r => r.duration_sec < 5).length
    const longRallies = rallies.filter(r => r.duration_sec > 15).length

    const systemPrompt = `You are an expert badminton coach and match analyst. Give sharp, tactical, actionable insights — like a real coach would. Be specific, avoid generic advice. Use badminton terminology correctly.`

    const dataBlock = `MATCH DATA:
Duration: ${(summary.duration_sec / 60).toFixed(1)} min | Rallies: ${summary.total_rallies} | Avg rally: ${summary.avg_rally_sec}s | Max rally: ${summary.max_rally_sec}s
Short rallies (<5s): ${shortRallies} | Long rallies (>15s): ${longRallies} | Total shots: ${summary.total_shots}
Avg speed: ${summary.avg_speed_px_per_sec} px/s | Peak speed: ${summary.max_speed_px_per_sec} px/s
Shot zones — Near: L${zones.near_left?.pct ?? 0}% C${zones.near_center?.pct ?? 0}% R${zones.near_right?.pct ?? 0}% | Far: L${zones.far_left?.pct ?? 0}% C${zones.far_center?.pct ?? 0}% R${zones.far_right?.pct ?? 0}%
Shot types: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}
Placement: left ${analysis.shot_pattern?.left_pct ?? 0}% / center ${analysis.shot_pattern?.center_pct ?? 0}% / right ${analysis.shot_pattern?.right_pct ?? 0}%`

    const userMsg = question
      ? `${dataBlock}\n\nQUESTION: ${question}`
      : `${dataBlock}\n\nProvide a full tactical analysis: dominant zones, shot patterns, tactical tendencies, and 2-3 specific improvement suggestions.`

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1024,
    })

    return { ok: true, text: completion.choices[0].message.content }
  } catch (err) {
    const msg = err.message || ''
    if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('No API key')) {
      return { ok: false, error: 'Invalid Groq API key. Get a free key at console.groq.com and paste it in Settings.' }
    }
    if (msg.includes('429')) {
      return { ok: false, error: 'Rate limit hit. Wait a minute and try again (Groq free tier: 30 req/min).' }
    }
    return { ok: false, error: msg }
  }
})
