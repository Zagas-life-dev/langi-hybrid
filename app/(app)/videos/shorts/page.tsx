import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { getShorts, parseShortsMode, type ShortsMode } from '@/lib/youtube'
import { watchedVideoIds } from '@/lib/ranking'
import ShortsFeed from '@/components/ShortsFeed'
import HideScrollbar from '@/components/HideScrollbar'

export const dynamic = 'force-dynamic'

// Mix is the default: lessons and fun/immersion clips (cartoons, comedy,
// challenges…) alternate. Fun / Learn narrow the feed to one kind.
const MODES: { key: ShortsMode; label: string }[] = [
  { key: 'mix', label: 'Mix' },
  { key: 'fun', label: 'Fun' },
  { key: 'learn', label: 'Learn' },
]

export default async function ShortsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = parseShortsMode((await searchParams).mode)
  const { dbUser } = await requireUser()
  const lang = dbUser.learningLang
  // Exclude already-watched shorts up front (repetition control) — getShorts
  // applies it to both the fresh pull and the cached fallback.
  const watched = await watchedVideoIds(dbUser._id as Parameters<typeof watchedVideoIds>[0], lang)
  const { available, items, nextPageToken, variant } = await getShorts(lang, dbUser.cefrLevel, {
    excludeIds: watched,
    mode,
  })

  return (
    // Fill exactly the space between the sticky header and the mobile tab bar
    // so the swipeable feed never spills below the viewport. .cancel-nav-pad
    // undoes the tab-bar padding <main> adds; .h-feed uses dvh so it stays
    // correct as mobile browser chrome collapses.
    <div className="h-feed cancel-nav-pad flex flex-col max-w-4xl mx-auto px-4 md:px-6">
      <HideScrollbar />
      <div className="shrink-0 flex items-center justify-between gap-3 py-3">
        <Link href="/videos" className="inline-flex items-center gap-2 meta text-muted hover:text-accent">
          <ArrowLeft className="w-4 h-4" /> Videos
        </Link>
        <nav aria-label="Shorts mix" className="flex items-center gap-1.5">
          {MODES.map((m) => (
            <Link
              key={m.key}
              href={m.key === 'mix' ? '/videos/shorts' : `/videos/shorts?mode=${m.key}`}
              aria-current={m.key === mode ? 'page' : undefined}
              className={`chip text-xs sm:text-sm transition-colors ${m.key === mode ? 'bg-ink! text-paper' : 'hover:bg-accent-soft'}`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="hidden sm:flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" strokeWidth={2.2} />
          <span className="display font-display text-lg">Shorts</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
            <p className="display font-display text-2xl mb-3">No shorts yet</p>
            <p className="text-muted">
              {available
                ? 'We couldn’t load shorts right now — the YouTube quota may be exhausted. Try again later.'
                : 'Add a YOUTUBE_API_KEY to langi/.env.local to load the shorts feed.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          {/* key: switching mode remounts the feed with the new mode's clips. */}
          <ShortsFeed key={mode} items={items} lang={lang} initialNextPageToken={nextPageToken} initialVariant={variant} mode={mode} />
        </div>
      )}
    </div>
  )
}
