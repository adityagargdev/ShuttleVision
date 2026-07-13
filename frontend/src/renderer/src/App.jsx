import { useState, useEffect, useCallback } from 'react'
import { onAuthStateChanged, signOut, sendEmailVerification } from 'firebase/auth'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'
import LoginPage from './components/LoginPage'
import MatchHistory from './components/MatchHistory'
import UploadPanel from './components/UploadPanel'
import OverviewTab from './components/tabs/OverviewTab'
import HeatmapTab from './components/tabs/HeatmapTab'
import StatsTab from './components/tabs/StatsTab'
import RallyBrowserTab from './components/tabs/RallyBrowserTab'
import TrajectoriesTab from './components/tabs/TrajectoriesTab'
import AIAnalysisTab from './components/tabs/AIAnalysisTab'
import VideoTab from './components/tabs/VideoTab'

const TABS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'heatmap',      label: 'Heatmap' },
  { id: 'stats',        label: 'Stats' },
  { id: 'rallies',      label: 'Rallies' },
  { id: 'trajectories', label: 'Trajectories' },
  { id: 'video',        label: 'Video Player' },
  { id: 'ai',           label: 'AI Analysis' },
]

export default function App() {
  // ── Auth state ─────────────────────────────────────────────────────────────
  const [user, setUser]               = useState(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [view, setView]               = useState('history') // 'history' | 'app'
  const [cloudSaving, setCloudSaving] = useState(false)
  const [cloudSaved, setCloudSaved]   = useState(false)
  const [verifyResent, setVerifyResent] = useState(false)
  const [verifyChecking, setVerifyChecking] = useState(false)

  // ── Analysis state ─────────────────────────────────────────────────────────
  const [videoPath, setVideoPath]     = useState(null)
  const [csvPath, setCsvPath]         = useState(null)
  const [outDir, setOutDir]           = useState(null)
  const [trackPlayers, setTrackPlayers] = useState(false)
  const [status, setStatus]           = useState('idle')
  const [progress, setProgress]       = useState([])
  const [analysis, setAnalysis]       = useState(null)
  const [activeTab, setActiveTab]     = useState('overview')
  const [seekIntent, setSeekIntent]   = useState(null)

  // ── Settings ───────────────────────────────────────────────────────────────
  const [apiKey, setApiKey]           = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [keySaved, setKeySaved]       = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setEmailVerified(u?.emailVerified ?? false)
      setAuthLoading(false)
      if (u) {
        // API key is scoped per user so different accounts stay independent
        setApiKey(localStorage.getItem(`geminiKey_${u.uid}`) || '')
        if (!localStorage.getItem(`onboarded_${u.uid}`)) {
          setShowOnboarding(true)
        }
      }
    })
    return unsub
  }, [])

  const handleCheckVerification = useCallback(async () => {
    setVerifyChecking(true)
    try {
      await auth.currentUser?.reload()
      const verified = auth.currentUser?.emailVerified ?? false
      setEmailVerified(verified)
    } finally {
      setVerifyChecking(false)
    }
  }, [])

  const handleResendVerification = useCallback(async () => {
    if (!auth.currentUser) return
    await sendEmailVerification(auth.currentUser)
    setVerifyResent(true)
    setTimeout(() => setVerifyResent(false), 4000)
  }, [])

  // ── Pipeline progress listener ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.api.onProgress((msg) => {
      setProgress(prev => [...prev.slice(-120), msg])
    })
    return unsub
  }, [])

  // ── Save match metadata to Firestore after a local run ────────────────────
  // Analysis data stays on disk — Firestore only stores the path + summary
  // so the history grid can show past matches without re-running Python.
  const uploadToFirebase = useCallback(async (result) => {
    if (!user) return
    setCloudSaving(true)
    setCloudSaved(false)
    try {
      const { court_corners, ...summaryToSave } = result.summary || {}
      await addDoc(collection(db, 'users', user.uid, 'matches'), {
        videoName: result.meta?.video_path?.split(/[\\/]/).pop() || 'Unknown',
        analyzedAt: serverTimestamp(),
        summary: summaryToSave,
        localAnalysisPath: result.meta?.out_dir
          ? `${result.meta.out_dir}\\analysis.json`
          : null,
        localHeatmapPath: result.heatmap_path || null,
      })
      setCloudSaved(true)
      setTimeout(() => setCloudSaved(false), 3000)
    } catch (e) {
      console.error('Firestore save failed:', e)
    } finally {
      setCloudSaving(false)
    }
  }, [user])

  // ── Analyze a new match (local Python pipeline) ────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!videoPath || !outDir) return
    setStatus('analyzing')
    setProgress([])
    setCloudSaved(false)
    try {
      const result = await window.api.runAnalysis({ videoPath, csvPath, outDir, trackPlayers })
      setAnalysis(result)
      setStatus('done')
      setActiveTab('overview')
      uploadToFirebase(result) // fire-and-forget; shows cloud save indicator
    } catch (err) {
      setProgress(prev => [...prev, `ERROR:${err.message}`])
      setStatus('error')
    }
  }, [videoPath, csvPath, outDir, trackPlayers, uploadToFirebase])

  const handleReset = useCallback(() => {
    window.api.cancelAnalysis()
    setStatus('idle')
    setProgress([])
  }, [])

  const handleWatchRally = useCallback((rally) => {
    setSeekIntent({ time: rally.start_sec, key: Date.now() })
    setActiveTab('video')
  }, [])

  // ── Load a saved match from local disk (path stored in Firestore) ──────────
  const handleLoadCloudMatch = useCallback(async (matchDoc) => {
    if (!matchDoc.localAnalysisPath) {
      alert('No local path saved for this match.')
      return
    }
    const result = await window.api.loadAnalysis(matchDoc.localAnalysisPath)
    if (!result) {
      alert(
        `Analysis file not found on this machine:\n${matchDoc.localAnalysisPath}\n\n` +
        `Match history is tied to the machine where the analysis was run.`
      )
      return
    }
    setAnalysis(result)
    setStatus('done')
    setActiveTab('overview')
    setView('app')
  }, [])

  const handleLoadAnalysisJson = useCallback(async () => {
    const path = await window.api.selectAnalysisJson()
    if (!path) return
    const result = await window.api.loadAnalysis(path)
    if (!result) {
      alert(`Could not read analysis file:\n${path}`)
      return
    }
    setAnalysis(result)
    setStatus('done')
    setActiveTab('overview')
  }, [])

  const goToHistory = useCallback(() => {
    setView('history')
    setAnalysis(null)
    setStatus('idle')
    setProgress([])
  }, [])

  // ── Render guards ──────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!emailVerified) {
    return (
      <div className="h-screen bg-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center">
          <span className="text-4xl">📧</span>
          <h2 className="text-lg font-bold mt-4 mb-2">Verify your email</h2>
          <p className="text-sm text-muted mb-1">
            We sent a link to
          </p>
          <p className="text-sm text-white font-medium mb-6">{user.email}</p>
          <p className="text-xs text-muted mb-6">
            Click the link in that email, then come back here and press the button below.
          </p>

          <button
            onClick={handleCheckVerification}
            disabled={verifyChecking}
            className="w-full py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 mb-3"
          >
            {verifyChecking
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Checking…
                </span>
              : "I've verified my email"}
          </button>

          <button
            onClick={handleResendVerification}
            disabled={verifyResent}
            className="w-full py-2 text-xs text-muted hover:text-accent transition-colors disabled:opacity-50"
          >
            {verifyResent ? '✓ Email sent!' : 'Resend verification email'}
          </button>

          <button
            onClick={() => signOut(auth)}
            className="mt-4 w-full py-2 text-xs text-muted hover:text-white border border-border rounded-xl transition-colors"
          >
            Use a different account
          </button>
        </div>
      </div>
    )
  }

  if (view === 'history') {
    return (
      <>
        <MatchHistory
          user={user}
          onNewAnalysis={() => setView('app')}
          onLoadMatch={handleLoadCloudMatch}
        />
        {showOnboarding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
            <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="text-center mb-6">
                <span className="text-5xl">🏸</span>
                <h2 className="text-xl font-bold mt-3 text-white">Welcome to ShuttleVision</h2>
                <p className="text-sm text-muted mt-1">Badminton match analytics, powered by AI</p>
              </div>

              <div className="space-y-3 mb-6">
                {[
                  { icon: '🎬', title: 'Upload your match video', desc: 'Local file or YouTube URL — any badminton footage works' },
                  { icon: '⚙️', title: 'Run the analysis pipeline', desc: 'Shuttle tracking, shot classification, heatmap, court detection' },
                  { icon: '🤖', title: 'Get AI coaching insights', desc: 'Ask Llama 3.3 70B tactical questions about your match data' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex gap-3 bg-bg border border-border rounded-xl px-4 py-3">
                    <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-yellow-900/20 border border-yellow-800/40 rounded-xl px-4 py-3 mb-6">
                <p className="text-xs font-semibold text-yellow-400 mb-1">One-time setup: free Groq API key</p>
                <p className="text-xs text-yellow-300/70 leading-relaxed">
                  The AI Analysis tab needs a free key from <span className="font-mono text-yellow-300">console.groq.com</span> — no credit card.
                  After signing up, go to <span className="font-medium text-yellow-300">Settings</span> (top-right) and paste it.
                  Click "?" in the AI Analysis tab for full instructions.
                </p>
              </div>

              <button
                onClick={() => {
                  localStorage.setItem(`onboarded_${user.uid}`, '1')
                  setShowOnboarding(false)
                }}
                className="w-full py-3 bg-accent hover:bg-accent-dim text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-accent/20"
              >
                Let's get started →
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Main app (analysis view) ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-bg text-slate-100">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goToHistory}
            className="text-muted hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-card transition-colors"
          >
            ← My Matches
          </button>
          <span className="text-muted/40 select-none">|</span>
          <span className="text-2xl">🏸</span>
          <span className="font-bold text-lg tracking-wide text-accent">ShuttleVision</span>
          {status === 'done' && (
            <span className="text-xs text-muted bg-card px-2 py-1 rounded-full border border-border truncate max-w-[180px]">
              {analysis?.meta?.video_path?.split(/[\\/]/).pop() || 'Cloud match'}
            </span>
          )}
          {cloudSaving && (
            <span className="text-xs text-muted flex items-center gap-1.5">
              <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" />
              Saving to cloud…
            </span>
          )}
          {cloudSaved && (
            <span className="text-xs text-green-400 font-medium">✓ Saved</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted hidden md:block">{user.email}</span>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="text-muted hover:text-white text-sm px-3 py-1 rounded-lg border border-border hover:border-accent transition-colors"
          >
            Settings
          </button>
          <button
            onClick={() => signOut(auth)}
            className="text-muted hover:text-white text-xs px-3 py-1 rounded-lg border border-border hover:border-slate-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Settings overlay */}
      {showSettings && (
        <div className="absolute top-14 right-4 z-50 bg-card border border-border rounded-xl p-5 w-80 shadow-2xl">
          <p className="text-sm font-medium mb-2">Groq API Key</p>
          <input
            type="password"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            value={apiKey}
            placeholder="gsk_..."
            onKeyDown={e => e.key === 'Enter' && setShowSettings(false)}
            onChange={e => {
              const v = e.target.value
              setApiKey(v)
              localStorage.setItem(`geminiKey_${user.uid}`, v)
              setKeySaved(true)
              setTimeout(() => setKeySaved(false), 2000)
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted">Stored locally in your browser.</p>
            {keySaved && <span className="text-xs text-green-400 shrink-0 ml-2">✓ Saved</span>}
          </div>
          {!apiKey && (
            <div className="mt-3 bg-bg border border-border rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-medium text-slate-300">How to get a free Groq key:</p>
              <ol className="text-xs text-muted space-y-0.5 list-decimal list-inside">
                <li>Go to <span className="font-mono text-accent">console.groq.com</span> → sign up free</li>
                <li>API Keys → Create API key → copy it</li>
                <li>Paste above (starts with <span className="font-mono">gsk_</span>)</li>
              </ol>
            </div>
          )}
          <button
            onClick={() => setShowSettings(false)}
            className="mt-3 text-xs text-accent hover:underline"
          >
            Close
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <aside className="w-64 shrink-0 border-r border-border flex flex-col p-4 gap-3 overflow-y-auto">
          <UploadPanel
            videoPath={videoPath}    setVideoPath={setVideoPath}
            csvPath={csvPath}        setCsvPath={setCsvPath}
            outDir={outDir}          setOutDir={setOutDir}
            trackPlayers={trackPlayers} setTrackPlayers={setTrackPlayers}
            status={status}
            onAnalyze={handleAnalyze}
            onReset={handleReset}
            onLoadJson={handleLoadAnalysisJson}
          />

          {(status === 'analyzing' || status === 'error') && (
            <div className="mt-2 bg-bg border border-border rounded-lg p-3 max-h-72 overflow-y-auto">
              <p className="text-xs text-muted mb-2 font-medium">Pipeline log</p>
              <div className="progress-log">
                {progress.map((line, i) => (
                  <div key={i} className={
                    line.startsWith('ERROR') ? 'text-red-400' :
                    line.startsWith('STEP')  ? 'text-accent' :
                    line.startsWith('DONE')  ? 'text-green-400' :
                    'text-slate-400'
                  }>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {analysis ? (
            <>
              <nav className="flex border-b border-border px-4 shrink-0">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3 text-sm font-medium transition-colors hover:text-white ${
                      activeTab === tab.id ? 'tab-active' : 'text-muted'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'overview'     && <OverviewTab     analysis={analysis} />}
                {activeTab === 'heatmap'      && <HeatmapTab      analysis={analysis} />}
                {activeTab === 'stats'        && <StatsTab        analysis={analysis} />}
                {activeTab === 'rallies'      && (
                  <RallyBrowserTab analysis={analysis} onWatchRally={handleWatchRally} />
                )}
                {activeTab === 'trajectories' && <TrajectoriesTab analysis={analysis} />}
                {activeTab === 'video'        && (
                  <VideoTab analysis={analysis} seekIntent={seekIntent} />
                )}
                {activeTab === 'ai'           && <AIAnalysisTab   analysis={analysis} apiKey={apiKey} />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="text-6xl">🏸</div>
              <h2 className="text-2xl font-bold text-white">Analyze a Match</h2>
              <p className="text-muted max-w-sm text-sm leading-relaxed">
                Select a match video on the left and click Analyze.
                Results are automatically saved to your account.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-4 text-xs text-muted">
                {[
                  'Shuttle Heatmap', 'Shot Classification', 'Rally Analysis',
                  'Speed Histogram', 'Trajectory Viewer', 'Video Player + Clips',
                  'Player Heatmap', 'AI Tactical Insights', 'Highlight Export',
                ].map(f => (
                  <div key={f} className="bg-card border border-border rounded-lg px-3 py-2">{f}</div>
                ))}
              </div>
              <button onClick={goToHistory} className="mt-2 text-xs text-accent hover:underline">
                ← View past matches
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
