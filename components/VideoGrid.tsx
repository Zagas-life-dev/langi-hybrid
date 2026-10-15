import Image from 'next/image'
import Link from 'next/link'
import { CoverageBadge, type RowItem } from '@/components/VideoRow'

// YouTube-style home grid: big thumbnails, channel avatar + title underneath.
// Used by every tab on /videos.
export default function VideoGrid({ items, empty }: { items: RowItem[]; empty?: string }) {
  if (!items.length) {
    return <p className="text-muted py-16 text-center">{empty || 'Nothing here yet.'}</p>
  }
  return (
    <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((v) => (
        <VideoGridCard key={v.videoId} v={v} />
      ))}
    </div>
  )
}

// Avatar colours cycle through the palette, picked stably from the channel name.
const AVATAR_BG = ['bg-purple text-on-purple', 'bg-lime text-on-bright', 'bg-pink text-on-bright', 'bg-orange text-on-bright', 'bg-yellow text-on-bright', 'bg-sky text-on-bright']

function avatarClass(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

export function VideoGridCard({ v }: { v: RowItem }) {
  const initial = (v.channelTitle || '?').trim().charAt(0).toUpperCase()
  return (
    <Link href={`/videos/${v.videoId}`} className="group block min-w-0">
      <div className="relative aspect-video overflow-hidden rounded-[18px] border-2 border-line bg-paper-dark shadow-(--shadow-sm) transition-transform group-hover:-translate-y-0.5">
        {v.thumbnail && (
          <Image
            src={v.thumbnail}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        {v.coverage !== undefined && <CoverageBadge coverage={v.coverage} />}
        {v.progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40" aria-label={`${Math.round(v.progress * 100)}% watched`}>
            <div className="h-full bg-accent" style={{ width: `${Math.max(2, v.progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-3">
        <span
          aria-hidden
          className={`w-9 h-9 shrink-0 rounded-full border-2 border-line grid place-items-center font-display text-sm font-bold ${avatarClass(v.channelTitle || '')}`}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-snug line-clamp-2 group-hover:text-accent transition-colors">{v.title}</p>
          <p className="text-sm text-muted truncate mt-0.5">{v.channelTitle}</p>
        </div>
      </div>
    </Link>
  )
}
