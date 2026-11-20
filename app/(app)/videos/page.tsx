import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { decodeEntities, getLearningVideos, searchForYou } from '@/lib/youtube'
import { candidatePool, engagementProfile, invalidateCandidatePool, rankForUser, seededRandom, watchedVideoIds } from '@/lib/ranking'
import { upsertVideoDocs } from '@/lib/videoIndex'
import WatchHistory from '@/lib/models/WatchHistory'
import { watchProgress } from '@/lib/resume'
import { after } from 'next/server'
import { coverageForLang, unprofiled, warmProfiles } from '@/lib/wordKnowledge'
import { SWEET_SPOT } from '@/lib/wordsCore'
import VideoDoc from '@/lib/models/VideoDoc'
import VideoRow, { type RowItem } from '@/components/VideoRow'
import VideoGrid from '@/components/VideoGrid'
import RefreshFeedButton from '@/components/RefreshFeedButton'
import Pagination from '@/components/Pagination'
import { Video as YoutubeIcon, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

/** Videos given a word profile in the background per page view (2 YouTube calls each). */
const WARM_PER_VISIT = 6
/** Videos per grid page (divides into 2 and 3 columns). */
const PAGE = 24
/** Short tab labels for the curated feeds. */
const CATEGORY_CHIP: Record<string, string> = {
  casual: 'Fun & immersion', lessons: 'Lessons', classes: 'Classes', creators: 'Creators',
}

/** A fresh shuffle seed per visit. */
function newSeed(): number {
  return 1 + Math.floor(Math.random() * 2 ** 30)
}

type Doc = { videoId: string; title: string; channelTitle: string; thumbnail: string }
const toItem = (d: Doc): RowItem => ({
  videoId: d.videoId, title: decodeEntities(d.title), channelTitle: decodeEntities(d.channelTitle), thumbnail: d.thumbnail,
})

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; s?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab || 'all'
  const page = Math.max(1, parseInt(sp.page || '', 10) || 1)
  // Shuffle seed: new on every fresh visit (no staleness), carried by the page
  // links so pages 2, 3… continue the same arrangement without repeats.
  const seed = parseInt(sp.s || '', 10) || newSeed()
  const { dbUser } = await requireUser()
  const lang = dbUser.learningLang
  const userId = dbUser._id as string
  await connectDB()

  // Everything the page needs, in parallel. The feed and pool are memoized
  // in-process (lib/youtube.ts, lib/ranking.ts), so warm loads are mostly cache.
  const [{ available, categories }, profile, watched, history, pool, coverageRaw] = await Promise.all([
    getLearningVideos(lang),
    engagementProfile(userId, lang),
    watchedVideoIds(userId, lang),
    WatchHistory.find({ userId, languageCode: lang }).sort({ watchedAt: -1 }).limit(48)
      .select('videoId completed position duration').lean(),
    candidatePool(lang),
    coverageForLang(dbUser, lang),
  ])
  const coverage = new Map([...coverageRaw].map(([id, c]) => [id, c.coverage]))
  const ctx = { profile, watched, coverage, rng: seededRandom(seed) }

  // Continue watching + Liked can include videos outside the pool — one lookup.
  const byId = new Map<string, Doc>(pool.map((d) => [d.videoId, d]))
  const missing = [...new Set([...history.map((h) => h.videoId), ...profile.liked])].filter((id) => !byId.has(id))
  if (missing.length) {
    const extra = await VideoDoc.find({ videoId: { $in: missing } }).select('videoId title channelTitle thumbnail').lean()
    for (const d of extra) byId.set(d.videoId, d)
  }
  const continueItems: RowItem[] = history
    .filter((h) => !h.completed && byId.has(h.videoId))
    .map((h) => ({ ...toItem(byId.get(h.videoId)!), progress: watchProgress(h.position, h.duration) }))

  // Favourite channels (from engagement) become their own tabs, like YouTube's chips.
  const favChannels = Object.entries(profile.channels)
    .filter(([ch, w]) => w >= 2 && pool.some((d) => d.channelTitle === ch))
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ch]) => ch)

  const liked = profile.liked.map((id) => byId.get(id)).filter((d): d is Doc => Boolean(d))
  const justRight = pool.filter((d) => {
    const c = coverage.get(d.videoId)
    return c !== undefined && c >= SWEET_SPOT.min && c <= SWEET_SPOT.max
  })
  const curated = categories.filter((c) => c.items.length > 0)

  const chips: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(continueItems.length ? [{ key: 'continue', label: 'Continue watching' }] : []),
    ...(justRight.length ? [{ key: 'justright', label: 'Just right' }] : []),
    ...(liked.length ? [{ key: 'liked', label: 'Liked' }] : []),
    ...favChannels.map((ch) => ({ key: `ch:${ch}`, label: ch })),
    ...curated.map((c) => ({ key: `cat:${c.key}`, label: CATEGORY_CHIP[c.key] || c.label })),
  ]
  const active = chips.some((c) => c.key === tab) ? tab : 'all'

  // The grid for the active tab. Everything is ranked by engagement and then
  // weighted-shuffled (see lib/ranking.ts), so each visit is a fresh arrangement.
  let grid: RowItem[]
  let empty = 'Nothing here yet.'
  if (active === 'continue') grid = continueItems
  else if (active === 'liked') grid = liked.map(toItem)
  else if (active === 'justright') grid = rankForUser(dbUser, justRight, ctx).map(toItem)
  else if (active.startsWith('ch:')) {
    const ch = active.slice(3)
    grid = rankForUser(dbUser, pool.filter((d) => d.channelTitle === ch), { ...ctx, minUnwatched: 6 }).map(toItem)
  } else if (active.startsWith('cat:')) {
    const cat = curated.find((c) => `cat:${c.key}` === active)
    const docs = (cat?.items || []).map((i) => byId.get(i.videoId) ?? i)
    grid = rankForUser(dbUser, docs, { ...ctx, minUnwatched: 9 }).map(toItem)
  } else {
    grid = rankForUser(dbUser, pool, ctx).map(toItem)
    empty = 'You’ve watched everything here — hit Refresh for new videos.'
  }
  const pages = Math.max(1, Math.ceil(grid.length / PAGE))
  const current = Math.min(page, pages)
  grid = grid.slice((current - 1) * PAGE, current * PAGE)
  for (const v of grid) v.coverage = coverage.get(v.videoId)

  // After the response: top up the pool with profile-matched YouTube results
  // (cached search) and word-profile a few tiles, so known-word badges and the
  // Just right tab fill in over the next visits. Never blocks the page.
  const gridIds = grid.map((v) => v.videoId)
  after(async () => {
    const topTags = Object.entries(profile.tags).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3)
    const fresh = await searchForYou(lang, topTags, dbUser.cefrLevel).catch(() => [])
    const known = new Set(pool.map((d) => d.videoId))
    const added = fresh.filter((v) => !known.has(v.videoId))
    if (added.length) {
      await upsertVideoDocs(added, lang, false)
      invalidateCandidatePool(lang)
    }
    const toWarm = await unprofiled(gridIds, lang, WARM_PER_VISIT)
    if (toWarm.length) await warmProfiles(toWarm, lang)
  })

  const href = (key: string, p = 1) => {
    const q = new URLSearchParams()
    if (key !== 'all') q.set('tab', key)
    if (p > 1) {
      q.set('page', String(p))
      q.set('s', String(seed))
    }
    const qs = q.toString()
    return qs ? `/videos?${qs}` : '/videos'
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="meta text-muted mb-1">Watch & learn</p>
          <h1 className="display font-display text-3xl sm:text-4xl">Videos</h1>
        </div>
        <Link
          href="/videos/shorts"
          className="inline-flex items-center gap-2 px-4 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold hover:bg-ink transition-colors"
        >
          <Zap className="w-4 h-4" strokeWidth={2.2} /> Shorts
        </Link>
      </div>

      {/* Tab chips — scroll sideways on narrow screens, like YouTube's. */}
      <nav aria-label="Video tabs" className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={href(c.key)}
            aria-current={c.key === active ? 'page' : undefined}
            className={`chip shrink-0 py-1.5! px-4! text-sm whitespace-nowrap transition-colors ${
              c.key === active ? 'bg-ink! text-paper' : 'hover:bg-accent-soft'
            }`}
          >
            {c.label}
          </Link>
        ))}
        {active === 'all' && <RefreshFeedButton />}
      </nav>

      {pool.length === 0 && !curated.length ? (
        <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
          <YoutubeIcon className="w-10 h-10 mx-auto mb-4 text-accent2" strokeWidth={2.2} />
          <p className="display font-display text-2xl mb-3">No videos yet</p>
          {available ? (
            <p className="text-muted">We couldn&apos;t load videos right now — the YouTube quota may be exhausted. Try again later.</p>
          ) : (
            <p className="text-muted leading-relaxed">
              The video feed is ready, but no <code className="font-mono text-ink">YOUTUBE_API_KEY</code> is configured yet.
              Add a YouTube Data API v3 key to <code className="font-mono text-ink">langi/.env.local</code> and reload.
            </p>
          )}
        </div>
      ) : (
        <>
          {active === 'all' && current === 1 && continueItems.length > 0 && (
            <VideoRow title="Continue watching" items={continueItems.slice(0, 8)} />
          )}
          <VideoGrid items={grid} empty={empty} />
          <Pagination page={current} pages={pages} href={(p) => href(active, p)} />
        </>
      )}
    </div>
  )
}
