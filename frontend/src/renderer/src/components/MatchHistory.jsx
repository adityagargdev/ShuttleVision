import { useState, useEffect } from 'react'
import { collection, getDocs, orderBy, query, deleteDoc, doc } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase'

export default function MatchHistory({ user, onNewAnalysis, onLoadMatch }) {
  const [matches, setMatches]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadingMatch, setLoadingMatch] = useState(null) // id of match being loaded

  useEffect(() => { fetchMatches() }, [user.uid])

  const fetchMatches = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'users', user.uid, 'matches'),
        orderBy('analyzedAt', 'desc')
      )
      const snap = await getDocs(q)
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error('Failed to fetch matches:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleLoad = async (match) => {
    setLoadingMatch(match.id)
    await onLoadMatch(match)
    setLoadingMatch(null)
  }

  const handleDelete = async (match, e) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${match.videoName}" from history? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'matches', match.id))
      setMatches(prev => prev.filter(m => m.id !== match.id))
    } catch (e) {
      console.error('Delete failed:', e)
    }
  }

  const fmt = (ts) => {
    if (!ts?.toDate) return 'Recently'
    return ts.toDate().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-slate-100">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏸</span>
          <span className="font-bold text-lg tracking-wide text-accent">ShuttleVision</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{user.email}</span>
          <button
            onClick={() => signOut(auth)}
            className="text-xs text-muted hover:text-white px-3 py-1.5 rounded-lg border border-border hover:border-slate-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl mx-auto">

          {/* Title row */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold">My Matches</h1>
              <p className="text-xs text-muted mt-0.5">
                {matches.length} match{matches.length !== 1 ? 'es' : ''} analyzed
              </p>
            </div>
            <button
              onClick={onNewAnalysis}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-accent/20"
            >
              + Analyze New Match
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-muted text-sm">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Loading your matches…
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <span className="text-6xl">🏸</span>
              <p className="text-xl font-bold">No matches yet</p>
              <p className="text-muted text-sm max-w-sm leading-relaxed">
                Analyze a match and the results will be saved here automatically —
                accessible from any device.
              </p>
              <button
                onClick={onNewAnalysis}
                className="mt-2 px-6 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl font-semibold text-sm transition-colors"
              >
                Analyze First Match
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {matches.map(match => (
                <div
                  key={match.id}
                  onClick={() => handleLoad(match)}
                  className="bg-card border border-border rounded-2xl p-5 hover:border-accent transition-all cursor-pointer group relative"
                >
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(match, e)}
                    className="absolute top-3 right-3 text-muted hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-all w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/20"
                    title="Delete match"
                  >
                    ✕
                  </button>

                  {/* Title */}
                  <div className="flex items-center gap-2 mb-1 pr-6">
                    <span className="text-xl shrink-0">🎬</span>
                    <p className="text-sm font-semibold truncate" title={match.videoName}>
                      {match.videoName}
                    </p>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-muted mb-4 ml-7">{fmt(match.analyzedAt)}</p>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Rallies"  value={match.summary?.total_rallies ?? '—'} />
                    <Stat label="Duration" value={
                      match.summary?.duration_sec
                        ? `${Math.round(match.summary.duration_sec / 60)}m ${Math.round(match.summary.duration_sec % 60)}s`
                        : '—'
                    } />
                    <Stat label="Shots"    value={match.summary?.total_shots ?? '—'} />
                    <Stat label="Avg rally" value={
                      match.summary?.avg_rally_sec ? `${match.summary.avg_rally_sec}s` : '—'
                    } />
                  </div>

                  <button
                    disabled={loadingMatch === match.id}
                    className="mt-4 w-full py-2 text-xs font-semibold text-accent border border-accent/30 rounded-xl hover:bg-accent/10 transition-colors disabled:opacity-50 group-hover:border-accent"
                  >
                    {loadingMatch === match.id
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                          Loading…
                        </span>
                      : 'Open Match →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-bg rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="text-sm font-bold mt-0.5">{value}</p>
    </div>
  )
}
