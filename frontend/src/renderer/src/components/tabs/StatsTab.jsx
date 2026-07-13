import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

const SHOT_COLORS = {
  smash: '#ef4444', clear: '#3b82f6', drop: '#f59e0b',
  lift: '#10b981', drive: '#8b5cf6', net: '#06b6d4', unknown: '#6b7280',
}

export default function StatsTab({ analysis }) {
  const hist = analysis.speed_histogram || { labels: [], counts: [] }
  const histData = hist.labels.map((l, i) => ({ range: l, count: hist.counts[i] || 0 }))

  const typeCounts = analysis.shot_type_counts || {}
  const typeData = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  const rallies = analysis.rallies || []
  const speedData = rallies.slice(0, 20).map((r, i) => ({
    rally: `R${r.id}`,
    avg: r.avg_speed_px,
    max: r.max_speed_px,
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">

        {/* Speed histogram */}
        <div className="stat-card">
          <p className="text-sm font-semibold mb-1">Speed Distribution (px/s)</p>
          <p className="text-xs text-muted mb-4">How fast was the shuttle moving at each detected frame?</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histData} barSize={22}>
              <XAxis dataKey="range" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161625', border: '1px solid #252540', borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histData.map((d, i) => (
                  <Cell key={i} fill={d.range.startsWith('200') || parseInt(d.range) > 1000 ? '#10b981' : '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Shot type breakdown */}
        <div className="stat-card">
          <p className="text-sm font-semibold mb-1">Shot Type Breakdown</p>
          <p className="text-xs text-muted mb-4">Classified by speed + direction heuristic</p>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={typeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {typeData.map((d, i) => (
                    <Cell key={i} fill={SHOT_COLORS[d.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#161625', border: '1px solid #252540', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted text-xs">No shot classification data</p>
          )}
        </div>

      </div>

      {/* Per-rally speed */}
      {speedData.length > 0 && (
        <div className="stat-card">
          <p className="text-sm font-semibold mb-1">Per-Rally Speed (first 20 rallies)</p>
          <p className="text-xs text-muted mb-4">Average and peak shuttle speed per rally</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={speedData} barGap={2} barSize={14}>
              <XAxis dataKey="rally" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161625', border: '1px solid #252540', borderRadius: 8 }} />
              <Bar dataKey="avg" name="Avg speed" fill="#6366f1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="max" name="Peak speed" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Shot type legend */}
      <div className="stat-card">
        <p className="text-sm font-semibold mb-3">Shot Type Guide</p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          {Object.entries(SHOT_COLORS).filter(([k]) => k !== 'unknown').map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
              <div>
                <span className="font-medium capitalize">{type}</span>
                <span className="text-muted ml-1">
                  {type === 'smash' ? '— fast, downward' :
                   type === 'clear' ? '— fast, upward' :
                   type === 'drop'  ? '— medium, downward' :
                   type === 'lift'  ? '— medium, upward' :
                   type === 'drive' ? '— fast, horizontal' :
                   '— slow, at net'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
