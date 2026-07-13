import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function OverviewTab({ analysis }) {
  const s = analysis.summary
  const rallies = analysis.rallies || []

  const rallyDurBuckets = [
    { label: '<5s',   count: rallies.filter(r => r.duration_sec < 5).length },
    { label: '5-10s', count: rallies.filter(r => r.duration_sec >= 5  && r.duration_sec < 10).length },
    { label: '10-20s',count: rallies.filter(r => r.duration_sec >= 10 && r.duration_sec < 20).length },
    { label: '20-40s',count: rallies.filter(r => r.duration_sec >= 20 && r.duration_sec < 40).length },
    { label: '>40s',  count: rallies.filter(r => r.duration_sec >= 40).length },
  ]

  const zones = analysis.shot_zones || {}
  const zoneData = Object.entries(zones).map(([k, v]) => ({
    name: k.replace('_', '\n'), value: v.pct ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Rallies"     value={s.total_rallies} />
        <StatCard label="Avg Rally"         value={`${s.avg_rally_sec}s`} />
        <StatCard label="Longest Rally"     value={`${s.max_rally_sec}s`} />
        <StatCard label="Shot Events"       value={s.total_shots} />
        <StatCard label="Avg Shuttle Speed" value={`${s.avg_speed_px_per_sec} px/s`} />
        <StatCard label="Peak Speed"        value={`${s.max_speed_px_per_sec} px/s`} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Rally length distribution */}
        <div className="stat-card">
          <p className="text-sm font-semibold mb-4">Rally Length Distribution</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rallyDurBuckets} barSize={28}>
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161625', border: '1px solid #252540', borderRadius: 8 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {rallyDurBuckets.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#6366f1' : i === 4 ? '#10b981' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Shot zones */}
        <div className="stat-card">
          <p className="text-sm font-semibold mb-4">Shot Zone Activity (%)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={zoneData} layout="vertical" barSize={14}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 10 }} width={80} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#161625', border: '1px solid #252540', borderRadius: 8 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Shot pattern */}
      <div className="stat-card">
        <p className="text-sm font-semibold mb-3">Shot Placement</p>
        <div className="flex gap-2 h-8">
          {[
            { label: 'Left', val: analysis.shot_pattern?.left_pct ?? 0,  color: '#6366f1' },
            { label: 'Center', val: analysis.shot_pattern?.center_pct ?? 0, color: '#10b981' },
            { label: 'Right', val: analysis.shot_pattern?.right_pct ?? 0, color: '#f59e0b' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex items-center gap-2" style={{ flex: val || 1 }}>
              <div className="h-full rounded-lg flex items-center justify-center text-xs font-bold text-white"
                   style={{ background: color, width: '100%' }}>
                {label} {val}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}
