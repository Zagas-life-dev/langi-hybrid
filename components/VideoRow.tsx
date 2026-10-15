import Image from 'next/image'
import Link from 'next/link'
import { SWEET_SPOT } from '@/lib/wordsCore'

export interface RowItem {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
  /** Fraction watched (0–1) — drawn as a bar on the thumbnail. */
  progress?: number
  /** Share of the video's words the learner knows (0–1), when profiled. */
  coverage?: number
}

// A horizontally-scrolling row of video cards (Continue watching, For your
// level, etc.). Each card links to the in-app watch page.
export default function VideoRow({
  title,
  blurb,
  items,
}: {
  title: string
  blurb?: string
  items: RowItem[]
}) {
  if (!items.length) return null
  return (
    <section className="mb-12">
      <h2 className="display font-display text-2xl mb-1">{title}</h2>
      {blurb && <p className="text-muted text-sm mb-4">{blurb}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {items.map((v) => (
          <VideoCard key={v.videoId} v={v} />
        ))}
      </div>
    </section>
  )
}

/** One video tile: thumbnail (with watched bar and known-words badge), title, channel. */
export function VideoCard({ v }: { v: RowItem }) {
  return (
    <Link href={`/videos/${v.videoId}`} className="brut-card overflow-hidden group w-64 shrink-0">
      <div className="relative aspect-video bg-paper-dark border-b border-line">
        {v.thumbnail && (
          <Image src={v.thumbnail} alt={v.title} fill sizes="256px" className="object-cover" />
        )}
        {v.coverage !== undefined && <CoverageBadge coverage={v.coverage} />}
        {v.progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40" aria-label={`${Math.round(v.progress * 100)}% watched`}>
            <div className="h-full bg-accent" style={{ width: `${Math.max(2, v.progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-medium text-sm leading-snug line-clamp-2 mb-1">{v.title}</p>
        <p className="meta text-muted truncate">{v.channelTitle}</p>
      </div>
    </Link>
  )
}

export function CoverageBadge({ coverage }: { coverage: number }) {
  const pct = Math.floor(coverage * 100)
  const band = coverage > SWEET_SPOT.max ? 'easy' : coverage >= SWEET_SPOT.min ? 'just right' : 'challenging'
  const dot = band === 'just right' ? 'bg-emerald-400' : band === 'easy' ? 'bg-sky-300' : 'bg-amber-400'
  return (
    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1.5 bg-black/75 text-white text-[11px] font-mono px-1.5 py-0.5"
      title={`You know about ${pct}% of the words in this video — ${band}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
      {pct}% known
    </span>
  )
}
