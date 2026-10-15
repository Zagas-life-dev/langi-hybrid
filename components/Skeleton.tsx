// Loading placeholders. These mirror the shape of the real content so the page
// doesn't reflow when data lands — the point is a stable layout, not decoration.
// Visual treatment lives in the .skeleton class in globals.css.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

/** Stand-in for a run of body text. The last line is short, like real prose. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

/** Matches the .brut-card blocks used across the dashboard and list pages. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`border-[2.5px] border-line rounded-[24px] p-5 ${className}`} aria-hidden="true">
      <div className="skeleton h-4 w-1/3 mb-3" />
      <SkeletonText lines={2} />
    </div>
  )
}

/**
 * Wrapper that announces loading to assistive tech. Screen readers get the
 * status text; sighted users get the skeletons, which are aria-hidden.
 */
export function SkeletonPage({ label = 'Loading', children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/**
 * Prompt card + answer field + action row — the shape every study session
 * shares (flashcard review, grammar practice, mistakes, placement).
 */
export function QuizSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <SkeletonPage label={label}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-40 mb-5" />
      <Skeleton className="h-11 mb-4" />
      <div className="flex gap-3">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-28" />
      </div>
    </SkeletonPage>
  )
}
