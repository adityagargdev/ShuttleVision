import { useState, useRef, useEffect } from 'react'

export default function VideoTab({ analysis, seekIntent }) {
  const videoRef    = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]       = useState(0)
  const [clips, setClips]             = useState([])
  const [exporting, setExporting]     = useState(false)
  const [exportLog, setExportLog]     = useState('')

  const rallies      = analysis.rallies       || []
  const meta         = analysis.meta          || {}
  const isCloudLoaded = analysis._cloudLoaded === true
  const videoSrc = meta.video_path
    ? `file:///${meta.video_path.replace(/\\/g, '/')}`
    : null

  const analysisJsonPath = meta.out_dir
    ? `${meta.out_dir}/analysis.json`.replace(/\\/g, '/')
    : null

  // Seek when App tells us to jump to a rally
  useEffect(() => {
    if (!seekIntent || !videoRef.current) return
    videoRef.current.currentTime = seekIntent.time
    videoRef.current.play().catch(() => {})
  }, [seekIntent])

  const seekToRally = (rally) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = rally.start_sec
    videoRef.current.play().catch(() => {})
  }

  const currentRally = rallies.find(
    r => currentTime >= r.start_sec && currentTime <= r.end_sec
  )

  const handleExport = async () => {
    if (!meta.video_path || !analysisJsonPath || !meta.out_dir) return
    setExporting(true)
    setExportLog('Starting export...')

    const unsub = window.api.onHighlightProgress((msg) => {
      if (msg.startsWith('CLIP:')) {
        const name = msg.replace('CLIP:', '').trim().split(/[\\/]/).pop()
        setExportLog(prev => prev + `\nSaved: ${name}`)
      }
    })

    try {
      const result = await window.api.exportHighlights({
        videoPath: meta.video_path,
        analysisJsonPath,
        outDir: meta.out_dir,
      })
      setClips(result)
      setExportLog(`Done — ${result.length} clips saved to output folder`)
    } catch (e) {
      setExportLog('Error: ' + e.message)
    } finally {
      unsub()
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* Video element */}
      {isCloudLoaded ? (
        <div className="stat-card flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="text-4xl">☁️</span>
          <p className="text-sm font-semibold">Video not available</p>
          <p className="text-xs text-muted max-w-xs leading-relaxed">
            This match was loaded from the cloud. The video file stays on the machine
            where the analysis was originally run. All other tabs work normally.
          </p>
        </div>
      ) : videoSrc ? (
        <div className="stat-card p-3">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            className="w-full rounded-lg"
            style={{ maxHeight: 420 }}
            onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
            onLoadedMetadata={e => setDuration(e.target.duration)}
          />
        </div>
      ) : (
        <div className="stat-card text-center text-muted py-12">
          No video path in analysis
        </div>
      )}

      {/* Rally timeline scrubber */}
      {duration > 0 && (
        <div className="stat-card">
          <p className="text-xs text-muted mb-3 uppercase tracking-wider">
            Rally Timeline — click a segment to jump
          </p>
          <div className="relative h-8 bg-bg rounded-lg overflow-hidden">
            {rallies.map(r => (
              <button
                key={r.id}
                onClick={() => seekToRally(r)}
                title={`Rally ${r.id + 1}: ${r.start_sec}s–${r.end_sec}s`}
                className="absolute h-full rounded hover:brightness-125 transition-all"
                style={{
                  left:       `${(r.start_sec / duration) * 100}%`,
                  width:      `${Math.max((r.duration_sec / duration) * 100, 0.4)}%`,
                  background: currentRally?.id === r.id
                    ? '#6366f1'
                    : 'rgba(99,102,241,0.35)',
                  border: currentRally?.id === r.id ? '1px solid #818cf8' : 'none',
                }}
              />
            ))}
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-white/70 pointer-events-none"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted mt-1.5">
            <span>{fmt(currentTime)}</span>
            {currentRally ? (
              <span className="text-accent font-medium">
                Rally {currentRally.id + 1} · {currentRally.duration_sec}s
              </span>
            ) : (
              <span>Between rallies</span>
            )}
            <span>{fmt(duration)}</span>
          </div>
        </div>
      )}

      {/* Jump grid */}
      {rallies.length > 0 && (
        <div className="stat-card">
          <p className="text-sm font-semibold mb-3">Jump to Rally</p>
          <div className="grid grid-cols-5 gap-2">
            {rallies.map(r => (
              <button
                key={r.id}
                onClick={() => seekToRally(r)}
                className={`text-xs px-2 py-2 rounded-lg border transition-colors ${
                  currentRally?.id === r.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border hover:border-accent text-muted hover:text-white'
                }`}
              >
                <div className="font-semibold">#{r.id + 1}</div>
                <div className="text-muted text-[10px]">{r.duration_sec}s</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Highlight export */}
      <div className="stat-card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Export Rally Highlights</p>
          <button
            onClick={handleExport}
            disabled={exporting || !meta.video_path || isCloudLoaded}
            className="px-4 py-2 bg-accent hover:bg-accent-dim text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : `Export ${rallies.length} clips`}
          </button>
        </div>

        {exportLog && (
          <pre className="text-xs text-slate-400 bg-bg rounded-lg p-3 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
            {exportLog}
          </pre>
        )}

        {clips.length > 0 && (
          <div className="space-y-1.5">
            {clips.map((clipPath, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted">{clipPath.split(/[\\/]/).pop()}</span>
                <button
                  onClick={() => window.api.openFile(clipPath)}
                  className="text-accent hover:underline"
                >
                  Open in player
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
