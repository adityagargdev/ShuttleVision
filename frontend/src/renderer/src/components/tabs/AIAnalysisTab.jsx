import { useState } from 'react'

function HelpModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">AI Analysis — How to use</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
          >
            ×
          </button>
        </div>

        {/* What it does */}
        <section className="mb-5">
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">What it does</h4>
          <p className="text-sm text-slate-300 leading-relaxed">
            After your match is analyzed, the AI reads your actual statistics — rally lengths,
            shot type distribution, court zone coverage, speed data — and gives you personalized
            tactical coaching insights using <span className="text-white font-medium">Llama 3.3 70B</span> (Meta's top open model), running free via Groq.
          </p>
        </section>

        {/* Setup */}
        <section className="mb-5">
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Step-by-step setup (2 minutes, free)</h4>
          <ol className="space-y-2.5">
            {[
              { n: '1', text: <>Go to <span className="font-mono text-accent">console.groq.com</span> and sign up — no credit card needed</> },
              { n: '2', text: <>In the left sidebar, click <span className="font-medium text-white">API Keys</span> → <span className="font-medium text-white">Create API Key</span></> },
              { n: '3', text: <>Copy the key — it starts with <span className="font-mono text-white">gsk_</span></> },
              { n: '4', text: <>In this app, click <span className="font-medium text-white">Settings</span> (top-right) → paste the key — it saves instantly</> },
            ].map(({ n, text }) => (
              <li key={n} className="flex gap-3 text-sm text-slate-300">
                <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-bold">{n}</span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted mt-2.5 ml-8">
            Your key is stored only on your device. Groq's free tier gives 14,400 requests/day — more than enough.
          </p>
        </section>

        {/* Good questions */}
        <section className="mb-5">
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Questions that work well</h4>
          <ul className="space-y-1.5">
            {[
              'What are my dominant tactical patterns in this match?',
              'Which court zones am I neglecting?',
              'What does my shot type distribution reveal about my style?',
              'How does my rally length suggest fitness or strategy issues?',
              'What specific things should I work on in training?',
              'Am I too predictable in my shot placement?',
            ].map(q => (
              <li key={q} className="flex gap-2 text-sm text-slate-400">
                <span className="text-accent shrink-0 mt-0.5">›</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Tips */}
        <section>
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">Tips</h4>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li className="flex gap-2"><span className="text-accent shrink-0">›</span> Run the full analysis first — the AI reads your real match numbers, not generic advice</li>
            <li className="flex gap-2"><span className="text-accent shrink-0">›</span> Use the quick-prompt buttons to get a broad overview, then ask specific follow-ups</li>
            <li className="flex gap-2"><span className="text-accent shrink-0">›</span> Compare across matches by loading a different analysis and asking the same question</li>
          </ul>
        </section>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default function AIAnalysisTab({ analysis, apiKey }) {
  const [response, setResponse]   = useState('')
  const [question, setQuestion]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [history, setHistory]     = useState([])
  const [showHelp, setShowHelp]   = useState(false)

  const hasKey = apiKey && apiKey.trim().length > 0

  const ask = async (q = null) => {
    const questionText = q !== null ? q : question.trim()
    if (!questionText) return
    if (!hasKey) { setError('Add your Groq API key in Settings (top-right) — it saves automatically as you type'); return }

    setLoading(true)
    setError('')
    const result = await window.api.askClaude({ apiKey, analysis, question: questionText || null })
    setLoading(false)

    if (result.ok) {
      const entry = { question: questionText || null, answer: result.text }
      setHistory(prev => [...prev, entry])
      setResponse(result.text)
      setQuestion('')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">AI Match Analysis</h2>
          <p className="text-xs text-muted mt-0.5">
            Powered by Llama 3.3 70B via Groq — tactical insights from your match data
          </p>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="text-xs text-muted hover:text-accent px-3 py-1.5 border border-border rounded-lg hover:border-accent transition-colors shrink-0"
        >
          ? How to use
        </button>
      </div>

      {/* No-key banner */}
      {!hasKey && (
        <div className="bg-yellow-900/20 border border-yellow-800/50 px-4 py-3 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-yellow-400">API key required — takes 2 minutes, completely free</p>
          <ol className="text-xs text-yellow-300/80 space-y-1 list-decimal list-inside">
            <li>Go to <span className="font-mono text-yellow-300">console.groq.com</span> and sign up (no card needed)</li>
            <li>Click <span className="font-medium">API Keys</span> in the sidebar → <span className="font-medium">Create API key</span> → copy it</li>
            <li>Click <span className="font-medium">Settings</span> (top-right of this app) → paste the key</li>
          </ol>
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs text-yellow-400/70 hover:text-yellow-300 underline mt-1"
          >
            Detailed instructions →
          </button>
        </div>
      )}

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2">
        {[
          'What are the dominant tactical patterns in this match?',
          'Which court zones should the player focus on?',
          'Analyze the shot type distribution — what does it reveal?',
          'How does rally length suggest player fitness or strategy?',
        ].map(prompt => (
          <button
            key={prompt}
            onClick={() => ask(prompt)}
            disabled={loading || !hasKey}
            className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-accent hover:text-accent transition-colors text-muted disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Response area */}
      {loading && (
        <div className="stat-card flex items-center gap-3 text-sm text-muted">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analyzing match data…
        </div>
      )}

      {error && (
        <div className="stat-card border-red-800/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {response && !loading && (
        <div className="stat-card">
          <div className="prose prose-invert prose-sm max-w-none">
            {response.split('\n').map((line, i) => (
              <p key={i} className={`text-sm leading-relaxed ${
                line.startsWith('#') ? 'font-bold text-accent text-base mt-3' :
                line.startsWith('-') || line.startsWith('•') ? 'ml-4 text-slate-300' :
                line === '' ? 'mb-2' :
                'text-slate-300'
              }`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up question */}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
          placeholder="Ask a follow-up question about this match…"
          disabled={loading || !hasKey}
          className="flex-1 bg-card border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent placeholder:text-muted disabled:opacity-40"
        />
        <button
          onClick={() => ask()}
          disabled={loading || !hasKey || !question.trim()}
          className="px-4 py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        >
          Ask
        </button>
      </div>

      {/* History */}
      {history.length > 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted uppercase tracking-wider">Previous questions</p>
          {history.slice(0, -1).reverse().map((h, i) => (
            <div key={i} className="stat-card border-border/50 opacity-70">
              {h.question && (
                <p className="text-xs text-accent mb-2">Q: {h.question}</p>
              )}
              <p className="text-xs text-slate-400 line-clamp-3">{h.answer}</p>
              <button
                onClick={() => setResponse(h.answer)}
                className="text-xs text-muted hover:text-accent mt-1 transition-colors"
              >
                expand
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
