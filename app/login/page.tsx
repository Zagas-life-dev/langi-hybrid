'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { AUTH_CARD, AuthError } from '@/components/AuthShell'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/learn')
      router.refresh()
    }
  }

  return (
    <AuthShell eyebrow="Bon retour !" title="Sign in">

          <form onSubmit={handleSubmit} className={`${AUTH_CARD} space-y-6`}>
            {error && (
              <AuthError>{error}</AuthError>
            )}
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
                  className="field-brut pr-12"
                  placeholder="••••••••"
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
            <div className="text-right">
              <Link href="/forgot-password" className="meta text-muted hover:text-accent transition-colors">
                Forgot password?
              </Link>
            </div>
            <button type="submit" disabled={loading} className="btn-ink w-full min-h-[3.4rem] text-lg">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-center meta text-muted">
              No account?{' '}
              <Link href="/signup" className="text-accent font-extrabold underline underline-offset-4 hover:text-accent-hover transition-colors">
                Sign up
              </Link>
            </p>
          </form>
    </AuthShell>
  )
}
