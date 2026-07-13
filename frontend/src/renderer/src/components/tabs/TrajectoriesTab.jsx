import { useState, useRef, useEffect } from 'react'

const FRAME_W = 640
const FRAME_H = 360
const CANVAS_W = 640
const CANVAS_H = 360

const SHOT_COLORS = {
  smash: '#ef4444', clear: '#3b82f6', drop: '#f59e0b',
  lift: '#10b981', drive: '#8b5cf6', net: '#06b6d4',
}

export default function TrajectoriesTab({ analysis }) {
  const trajectories = analysis.trajectories || []
  const shots = analysis.shots || []
  const canvasRef = useRef(null)

  const [selectedRally, setSelectedRally] = useState('all')
  const [showShots, setShowShots] = useState(true)

  const rallyIds = [...new Set(trajectories.map(t => t.rally_id))].sort((a, b) => a - b)

  const visibleArcs = selectedRally === 'all'
    ? trajectories
    : trajectories.filter(t => t.rally_id === Number(selectedRally))

  const visibleShots = selectedRally === 'all'
    ? shots
    : shots.filter(s => s.rally_id === Number(selectedRally))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Dark court background
    ctx.fillStyle = '#1a2e1a'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Draw court lines (simplified)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    // Boundary
    ctx.strokeRect(30, 20, CANVAS_W - 60, CANVAS_H - 40)
    // Net
    ctx.beginPath()
    ctx.moveTo(30, CANVAS_H / 2)
    ctx.lineTo(CANVAS_W - 30, CANVAS_H / 2)
    ctx.strokeStyle = 'rgba(100,200,255,0.5)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw trajectory arcs
    visibleArcs.forEach((arc, arcIdx) => {
      if (arc.xs.length < 2) return
      const hue = (arcIdx * 47) % 360
      ctx.strokeStyle = `hsla(${hue}, 70%, 65%, 0.6)`
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.beginPath()
      arc.xs.forEach((x, i) => {
        const px = (x / FRAME_W) * CANVAS_W
        const py = (arc.ys[i] / FRAME_H) * CANVAS_H
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()

      // Dot at start
      const sx = (arc.xs[0] / FRAME_W) * CANVAS_W
      const sy = (arc.ys[0] / FRAME_H) * CANVAS_H
      ctx.fillStyle = `hsla(${hue}, 70%, 80%, 0.8)`
      ctx.beginPath()
      ctx.arc(sx, sy, 3, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw shot events
    if (showShots) {
      visibleShots.forEach(shot => {
        const color = SHOT_COLORS[shot.type] || '#ffffff'
        const px = (shot.x / FRAME_W) * CANVAS_W
        const py = (shot.y / FRAME_H) * CANVAS_H
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()
      })
    }
  }, [visibleArcs, visibleShots, showShots])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Rally:</label>
          <select
            value={selectedRally}
            onChange={e => setSelectedRally(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
          >
            <option value="all">All rallies</option>
            {rallyIds.map(id => (
              <option key={id} value={id}>Rally {id + 1}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={showShots}
            onChange={e => setShowShots(e.target.checked)}
            className="accent-accent"
          />
          Show shot events
        </label>
        <span className="text-xs text-muted ml-auto">
          {visibleArcs.length} arcs · {visibleShots.length} shots
        </span>
      </div>

      {/* Canvas */}
      <div className="stat-card p-3">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full rounded-lg"
          style={{ maxHeight: 400, objectFit: 'contain' }}
        />
      </div>

      {/* Shot type legend */}
      {showShots && (
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(SHOT_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span className="text-muted capitalize">{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
