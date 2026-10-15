'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, AlertTriangle } from 'lucide-react'

// Route-level error boundary for every signed-in page. Without this, a thrown
// render/data error drops the user on Next's stock error screen with no way
// back into the app.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App route error:', error)
  }, [error])

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
      <div className="border-[2.5px] border-line rounded-[32px] p-8 sm:p-10 shadow-(--shadow-lg)">
        <AlertTriangle className="w-10 h-10 mx-auto mb-5 text-accent2" strokeWidth={2.2} />
        <h1 className="display font-display text-3xl mb-3">Something broke</h1>
        <p className="text-muted mb-8 leading-relaxed">
          That page failed to load. Your progress is saved — trying again usually sorts it.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button onClick={reset} className="btn-ink">
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
          <Link href="/learn" className="btn-ghost">Back to dashboard</Link>
        </div>
        {/* The digest is the only handle on a production stack trace, so make
            it copyable rather than hiding it in the console. */}
        {error.digest && <p className="meta text-muted mt-8">Ref: {error.digest}</p>}
      </div>
    </div>
  )
}
