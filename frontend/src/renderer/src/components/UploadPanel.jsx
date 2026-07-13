import { useState } from 'react'

export default function UploadPanel({
  videoPath, setVideoPath,
  csvPath, setCsvPath,
  outDir, setOutDir,
  trackPlayers, setTrackPlayers,
  status, onAnalyze, onReset, onLoadJson,
}) {
  const [ytUrl, setYtUrl]           = useState('')
  const [downloading, setDownloading] = useState(false)
  const [dlProgress, setDlProgress]   = useState(null) // 0-100 or null
  const [dlError, setDlError]         = useState('')

  const analyzing = status === 'analyzing'
  const ready = videoPath && outDir && !analyzing && !downloading

  const handleDownload = async () => {
    if (!ytUrl.trim() || !outDir) return
    setDownloading(true)
    setDlError('')
    setDlProgress(0)

    const unsub = window.api.onDownloadProgress((msg) => {
      if (msg.startsWith('PROGRESS:')) {
        const pct = Number(msg.replace('PROGRESS:', ''))
        if (!isNaN(pct)) setDlProgress(pct)
      } else if (msg.startsWith('INFO:')) {
        setDlError(msg.replace('INFO:', ''))
      } else if (msg.startsWith('LOG:') || msg.startsWith('ERROR:')) {
        setDlError(msg.replace(/^(LOG:|ERROR:)/, ''))
      }
    })

    try {
      const path = await window.api.downloadVideo({ url: ytUrl.trim(), outDir })
      setVideoPath(path)
      setYtUrl('')
      setDlProgress(null)
    } catch (e) {
      setDlError(e.message || 'Download failed')
      setDlProgress(null)
    } finally {
      unsub()
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">Input Files</p>

      {/* Video — file picker OR YouTube URL */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Video</span>
        <button
          onClick={async () => setVideoPath(await window.api.selectVideo())}
          className="text-left text-xs px-3 py-2 bg-bg border border-border rounded-lg hover:border-accent transition-colors truncate"
          title={videoPath || 'choose file'}
        >
          {videoPath
            ? <span className="text-accent">{videoPath.split(/[\\/]/).pop()}</span>
            : <span className="text-muted">rally.mp4</span>}
        </button>

        {/* YouTube row */}
        <div className="flex gap-1 mt-0.5">
          <input
            value={ytUrl}
            onChange={e => { setYtUrl(e.target.value); setDlError('') }}
            onKeyDown={e => e.key === 'Enter' && handleDownload()}
            placeholder="or paste YouTube URL…"
            disabled={downloading || !outDir}
            className="flex-1 min-w-0 text-xs px-2 py-1.5 bg-bg border border-border rounded-lg focus:outline-none focus:border-accent placeholder:text-muted/50 disabled:opacity-40"
          />
          <button
            onClick={handleDownload}
            disabled={!ytUrl.trim() || !outDir || downloading}
            className="text-xs px-2 py-1.5 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors disabled:opacity-40 shrink-0"
          >
            {downloading ? '…' : 'DL'}
          </button>
        </div>

        {/* Download progress */}
        {downloading && (
          <div className="mt-1">
            {dlProgress !== null ? (
              <>
                <div className="h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${dlProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted mt-0.5">{dlProgress}% downloaded</p>
              </>
            ) : (
              <p className="text-[10px] text-muted animate-pulse">
                {dlError || 'Fetching video info…'}
              </p>
            )}
          </div>
        )}
        {!downloading && dlError && (
          <p className="text-[10px] text-red-400">{dlError}</p>
        )}
        {!outDir && ytUrl && (
          <p className="text-[10px] text-yellow-500">Select output folder first</p>
        )}
      </div>

      <FileRow
        label="Predict CSV (optional — auto-detected if omitted)"
        value={csvPath}
        onSelect={async () => setCsvPath(await window.api.selectCsv())}
        placeholder="leave blank to run TrackNetV2 automatically"
      />
      <FileRow
        label="Output Dir"
        value={outDir}
        onSelect={async () => setOutDir(await window.api.selectOutDir())}
        placeholder="choose folder…"
      />

      {/* Options */}
      <div className="pt-1 border-t border-border">
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">Options</p>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={trackPlayers}
            onChange={e => setTrackPlayers(e.target.checked)}
            disabled={analyzing}
            className="accent-accent"
          />
          <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
            Track player positions
          </span>
        </label>
        {trackPlayers && (
          <p className="text-[10px] text-muted mt-1 ml-5">Runs YOLO on every 8th frame — adds ~60s</p>
        )}
      </div>

      <button
        onClick={onAnalyze}
        disabled={!ready}
        className={`mt-1 w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
          ready
            ? 'bg-accent hover:bg-accent-dim text-white shadow-lg shadow-accent/20'
            : 'bg-card text-muted cursor-not-allowed border border-border'
        }`}
      >
        {analyzing ? 'Analyzing…' : 'Analyze Match'}
      </button>

      <button
        onClick={onLoadJson}
        disabled={analyzing}
        className="w-full py-2 rounded-xl text-xs text-muted border border-border hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
        title="Skip re-analysis — open a previously saved analysis.json"
      >
        Load saved analysis.json
      </button>

      {analyzing && (
        <button
          onClick={onReset}
          className="w-full py-1.5 rounded-xl text-xs text-muted border border-border hover:border-red-500 hover:text-red-400 transition-colors"
        >
          Cancel / Reset
        </button>
      )}
    </div>
  )
}

function FileRow({ label, value, onSelect, placeholder }) {
  const name = value ? value.split(/[\\/]/).pop() : null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <button
        onClick={onSelect}
        className="text-left text-xs px-3 py-2 bg-bg border border-border rounded-lg hover:border-accent transition-colors truncate"
        title={value || placeholder}
      >
        {name
          ? <span className="text-accent">{name}</span>
          : <span className="text-muted">{placeholder}</span>}
      </button>
    </div>
  )
}
