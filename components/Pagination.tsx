import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageList(page: number, pages: number): (number | null)[] {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  const out: (number | null)[] = []
  let prev = 0
  for (const p of [...want].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push(null)
    out.push(p)
    prev = p
  }
  return out
}

// Numbered pagination (‹ 1 … 4 5 6 … 12 ›). `href(page)` builds each link.
export default function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null
  const base = 'chip min-w-10 h-10 justify-center text-sm'
  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-1.5 flex-wrap mt-12">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${base} hover:bg-accent-soft`} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" strokeWidth={2.6} />
        </Link>
      ) : (
        <span className={`${base} opacity-40`} aria-hidden><ChevronLeft className="w-4 h-4" strokeWidth={2.6} /></span>
      )}
      {pageList(page, pages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-muted font-bold" aria-hidden>…</span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${base} ${p === page ? 'bg-ink! text-paper' : 'hover:bg-accent-soft'}`}
          >
            {p}
          </Link>
        )
      )}
      {page < pages ? (
        <Link href={href(page + 1)} className={`${base} hover:bg-accent-soft`} aria-label="Next page">
          <ChevronRight className="w-4 h-4" strokeWidth={2.6} />
        </Link>
      ) : (
        <span className={`${base} opacity-40`} aria-hidden><ChevronRight className="w-4 h-4" strokeWidth={2.6} /></span>
      )}
    </nav>
  )
}
