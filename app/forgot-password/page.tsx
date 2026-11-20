'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell, { AUTH_CARD, AuthError } from '@/components/AuthShell'
import { sendResetEmail } from '@/lib/firebase/authClient'
import { authErrorMessage } from '@/lib/firebase/authCore'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await sendResetEmail(email)
      setSent(true)
    } catch (err) {
      // Never reveal whether an address has an account: "no such user" looks like success.
      if ((err as { code?: string }).code === 'auth/user-not-found') setSent(true)
      else { setError(authErrorMessage(err) || 'Could not send the email. Try again.'); setLoading(false) }
    }
  }

  return (
    <AuthShell eyebrow="Pas de panique" title="Reset password">

          {sent ? (
            <div className={`${AUTH_CARD} text-center`}>
              <p className="text-sm text-muted mb-6">Check your email for a reset link.</p>
              <Link href="/login" className="btn-ghost">Back to sign in</Link>
            </div>
          ) : (
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
              <button type="submit" disabled={loading} className="btn-ink w-full min-h-[3.4rem] text-lg">
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="text-center meta text-muted">
                <Link href="/login" className="text-accent font-extrabold underline underline-offset-4 hover:text-accent-hover transition-colors">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
    </AuthShell>
  )
}
