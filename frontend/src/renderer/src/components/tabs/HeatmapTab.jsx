export default function HeatmapTab({ analysis }) {
  const heatmap = analysis.heatmap_path
  const playerHeatmap = analysis.player_heatmap_path

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <HeatmapCard
          title="Shuttle Heatmap"
          subtitle="Where the shuttle spent most time on court"
          path={heatmap}
        />
        {playerHeatmap ? (
          <HeatmapCard
            title="Player Heatmap"
            subtitle="Where players positioned themselves on court"
            path={playerHeatmap}
          />
        ) : (
          <div className="stat-card flex flex-col items-center justify-center gap-3 min-h-[300px]">
            <span className="text-4xl">👟</span>
            <p className="text-sm font-semibold">Player Heatmap</p>
            <p className="text-xs text-muted text-center max-w-xs">
              Re-run analysis with player tracking enabled to see where each player
              positioned themselves during the match.
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="stat-card flex items-center gap-6 text-xs text-muted">
        <span className="font-medium text-white">Heat scale:</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-3 rounded-full" style={{
            background: 'linear-gradient(to right, #00008b, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)'
          }} />
          <span>low → high</span>
        </div>
        <span>Darker red = more shuttle activity in that zone</span>
      </div>
    </div>
  )
}

function HeatmapCard({ title, subtitle, path }) {
  if (!path) return null
  // Cloud URLs (Firebase Storage) start with https:// — use directly.
  // Local paths need the file:// prefix.
  const src = path.startsWith('http') ? path : `file:///${path.replace(/\\/g, '/')}`
  return (
    <div className="stat-card">
      <p className="text-sm font-semibold mb-1">{title}</p>
      <p className="text-xs text-muted mb-3">{subtitle}</p>
      <img
        src={src}
        alt={title}
        className="w-full rounded-lg border border-border"
        style={{ imageRendering: 'crisp-edges' }}
      />
    </div>
  )
}
