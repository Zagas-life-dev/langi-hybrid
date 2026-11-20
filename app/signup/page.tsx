'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AuthShell, { AUTH_CARD, AuthError } from '@/components/AuthShell'
import GoogleButton, { OrDivider } from '@/components/GoogleButton'
import { Eye, EyeOff } from 'lucide-react'
import { signInWithGoogle, signUpWithEmail } from '@/lib/firebase/authClient'
import { authErrorMessage } from '@/lib/firebase/authCore'

export default function SignupPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  // No inbox round trip: a new account goes straight to the placement test.
  function done(isNew: boolean) {
    router.push(isNew ? '/placement' : '/learn')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // `birthdate` gates mature content (auto-off for under-18s).
      done((await signUpWithEmail({ email, password, displayName, birthdate })).isNew)
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError('')
    try {
      // Google does not share a birthday: use the one typed below if there is one.
      done((await signInWithGoogle({ birthdate: birthdate || null })).isNew)
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthShell eyebrow="Salut ! Let’s begin" title="Create account">
      <div className={`${AUTH_CARD} space-y-6`}>
        {error && <AuthError>{error}</AuthError>}
        <GoogleButton onClick={handleGoogle} disabled={loading} label="Sign up with Google" />
        <OrDivider />
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="signup-name" className="meta block mb-2">Display name</label>
            <input
              id="signup-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="given-name"
              className="field-brut"
              placeholder="Marie"
            />
          </div>
          <div>
            <label htmlFor="signup-birthdate" className="meta block mb-2">Date of birth</label>
            <input
              id="signup-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              required
              max={today}
              className="field-brut"
            />
            <p className="meta text-muted mt-1">Used to age-gate mature stories. Adult content is off for under-18s, and stays off for Google sign-ups unless you fill this in first.</p>
          </div>
          <div>
            <label htmlFor="signup-email" className="meta block mb-2">E-mail address</label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password" className="meta block mb-2">Password</label>
            <div className="relative">
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="field-brut pr-12"
                placeholder="Min. 8 characters"
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
          <button type="submit" disabled={loading} className="btn-ink w-full min-h-14 text-lg">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-center meta text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent font-extrabold underline underline-offset-4 hover:text-accent-hover transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
