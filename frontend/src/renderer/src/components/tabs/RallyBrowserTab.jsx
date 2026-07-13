import { useState } from 'react'

export default function RallyBrowserTab({ analysis, onWatchRally }) {
  const rallies = analysis.rallies || []
  const shots = analysis.shots || []
  const [selected, setSelected] = useState(null)

  const selectedRally = selected !== null ? rallies.find(r => r.id === selected) : null
  const rallyShots = shots.filter(s => s.rally_id === selected)

  const maxDur = Math.max(...rallies.map(r => r.duration_sec), 1)

  return (
    <div className="flex gap-6 h-full">
      {/* Rally list */}
      <div className="w-72 shrink-0 space-y-1 overflow-y-auto pr-1">
        <p className="text-xs text-muted uppercase tracking-wider font-semibold mb-3">
          {rallies.length} rallies detected
        </p>
        {rallies.map(r => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
              selected === r.id
                ? 'bg-card border-accent text-white'
                : 'bg-bg border-border hover:border-slate-600 text-slate-300'
            }`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold">Rally {r.id + 1}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                r.duration_sec > 20 ? 'bg-green-900/50 text-green-400' :
                r.duration_sec > 10 ? 'bg-blue-900/50 text-blue-400' :
                'bg-slate-800 text-muted'
              }`}>
                {r.duration_sec}s
              </span>
            </div>
            {/* Duration bar */}
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.duration_sec / maxDur) * 100}%`,
                  background: r.duration_sec > 20 ? '#10b981' : '#6366f1',
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-muted">
              <span>{r.start_sec}s – {r.end_sec}s</span>
              <span>{r.shuttle_frames} detections</span>
            </div>
          </button>
        ))}
      </div>

      {/* Rally detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedRally ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold">Rally {selectedRally.id + 1}</h2>
              <span className="text-muted text-sm">{selectedRally.start_sec}s → {selectedRally.end_sec}s</span>
              {onWatchRally && (
                <button
                  onClick={() => onWatchRally(selectedRally)}
                  className="ml-auto text-xs px-3 py-1.5 bg-accent hover:bg-accent-dim text-white rounded-lg transition-colors"
                >
                  Watch in Video Player
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatMini label="Duration"        value={`${selectedRally.duration_sec}s`} />
              <StatMini label="Shuttle frames"  value={selectedRally.shuttle_frames} />
              <StatMini label="Avg speed"       value={`${selectedRally.avg_speed_px} px/s`} />
              <StatMini label="Peak speed"      value={`${selectedRally.max_speed_px} px/s`} />
              <StatMini label="Shot events"     value={rallyShots.length} />
              <StatMini label="Start frame"     value={`#${selectedRally.start_frame}`} />
            </div>

            {rallyShots.length > 0 && (
              <div className="stat-card">
                <p className="text-sm font-semibold mb-3">Shots in this rally</p>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {rallyShots.map((shot, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-muted w-6">{i + 1}.</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${shotBadgeClass(shot.type)}`}>
                        {shot.type}
                      </span>
                      <span className="text-muted">frame {shot.frame}</span>
                      <span className="text-muted">({shot.x}, {shot.y})</span>
                      <span className="ml-auto text-white font-medium">{shot.speed} px/s</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted text-sm gap-2">
            <span className="text-3xl">👈</span>
            <span>Select a rally to see details</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StatMini({ label, value }) {
  return (
    <div className="bg-bg border border-border rounded-lg p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  )
}

function shotBadgeClass(type) {
  const map = {
    smash: 'bg-red-900/60 text-red-400',
    clear: 'bg-blue-900/60 text-blue-400',
    drop:  'bg-yellow-900/60 text-yellow-400',
    lift:  'bg-green-900/60 text-green-400',
    drive: 'bg-purple-900/60 text-purple-400',
    net:   'bg-cyan-900/60 text-cyan-400',
  }
  return map[type] || 'bg-slate-800 text-muted'
}
