import { useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
} from 'firebase/auth'
import { auth } from '../firebase'

const googleProvider = new GoogleAuthProvider()

const cleanError = (msg) =>
  msg.replace('Firebase: ', '').replace(/\s*\(auth\/.*?\)\.?/, '').trim()

export default function LoginPage() {
  const [mode, setMode]         = useState('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password)
        await sendEmailVerification(user)
        // App.jsx sees emailVerified=false and shows the verification gate
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(cleanError(err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    try {
      await signInWithPopup(auth, googleProvider)
      // Google accounts are always pre-verified — goes straight to app
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(cleanError(err.message))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <span className="text-5xl">🏸</span>
          <h1 className="text-2xl font-bold text-white mt-3">ShuttleVision</h1>
          <p className="text-muted text-sm mt-1">Badminton match analytics</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8">
          <h2 className="text-lg font-semibold mb-6">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          {/* Google Sign-In */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 bg-white hover:bg-gray-100 text-gray-800 rounded-xl font-medium text-sm transition-colors disabled:opacity-50"
          >
            <GoogleLogo />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent placeholder:text-muted/50"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-xs text-muted mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent placeholder:text-muted/50"
                placeholder="••••••••"
              />
              {mode === 'signup' && (
                <p className="text-[11px] text-muted mt-1.5 ml-1">Minimum 6 characters</p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent-dim text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-6">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-accent hover:underline"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted/50 mt-6">
          Match data is saved to your account and accessible anywhere.
        </p>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z"/>
    </svg>
  )
}
