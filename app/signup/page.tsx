'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { AUTH_CARD, AuthError } from '@/components/AuthShell'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        // `birthdate` gates mature content (auto-off for under-18s).
        data: { display_name: displayName.trim(), birthdate },
      },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <AuthShell eyebrow="Presque fini !" title="Check your email">
        <div className={`${AUTH_CARD} text-center`}>
          <span className="sticker sticker-big sticker-lime absolute -top-5 -left-3">Oui !</span>
          <p className="text-ink-soft leading-relaxed pt-2">
            We sent a verification link to <strong className="text-ink">{email}</strong>. Click it
            to confirm your address, then sign in and take your placement test.
          </p>
          <Link href="/login" className="btn-ghost mt-8">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Salut ! Let’s begin" title="Create account">

          <form onSubmit={handleSubmit} className={`${AUTH_CARD} space-y-6`}>
            {error && (
              <AuthError>{error}</AuthError>
            )}
            <div>
              <label className="meta block mb-2">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="field-brut"
                placeholder="Marie"
              />
            </div>
            <div>
              <label className="meta block mb-2">Date of birth</label>
              <input
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                required
                max={today}
                className="field-brut"
              />
              <p className="meta text-muted mt-1">Used to age-gate mature stories. Adult content is off for under-18s.</p>
            </div>
            <div>
              <label className="meta block mb-2">E-mail address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="field-brut"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="meta block mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="field-brut pr-12"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" strokeWidth={2.4} /> : <Eye className="w-[18px] h-[18px]" strokeWidth={2.4} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-ink w-full min-h-[3.4rem] text-lg">
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <p className="text-center meta text-muted">
              Already have an account?{' '}
              <Link href="/login" className="text-accent font-extrabold underline underline-offset-4 hover:text-accent-hover transition-colors">
                Sign in
              </Link>
            </p>
          </form>
    </AuthShell>
  )
}
