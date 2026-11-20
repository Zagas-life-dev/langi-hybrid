'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthShell, { AUTH_CARD, AuthError } from '@/components/AuthShell'
import GoogleButton, { OrDivider } from '@/components/GoogleButton'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { signInWithEmail, signInWithGoogle } from '@/lib/firebase/authClient'
import { authErrorMessage } from '@/lib/firebase/authCore'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // The app sends people here with ?reauth=1 when their saved session stopped working: clear it so
  // they can sign in fresh instead of bouncing back.
  useEffect(() => {
    if (new URLSearchParams(location.search).has('reauth')) fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {})
  }, [])

  function done(isNew: boolean) {
    router.push(isNew ? '/placement' : '/learn')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      done((await signInWithEmail(email, password)).isNew)
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError('')
    try {
      done((await signInWithGoogle()).isNew)
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthShell eyebrow="Bon retour !" title="Sign in">
      <div className={`${AUTH_CARD} space-y-6`}>
        {error && <AuthError>{error}</AuthError>}
        <GoogleButton onClick={handleGoogle} disabled={loading} />
        <OrDivider />
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="login-email" className="meta block mb-2">E-mail address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="field-brut"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="meta block mb-2">Password</label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="field-brut pr-12"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" strokeWidth={2.4} /> : <Eye className="w-4.5 h-4.5" strokeWidth={2.4} />}
              </button>
            </div>
          </div>
          <div className="text-right">
            <Link href="/forgot-password" className="meta text-muted hover:text-accent transition-colors">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={loading} className="btn-ink w-full min-h-14 text-lg">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center meta text-muted">
          No account?{' '}
          <Link href="/signup" className="text-accent font-extrabold underline underline-offset-4 hover:text-accent-hover transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
