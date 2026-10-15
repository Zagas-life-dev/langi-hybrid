import Image from 'next/image'
import Link from 'next/link'
import type { IVideoItem } from '@/lib/models/VideoCache'

// "Up next" rail of same-language recommendations. Each card links to another
// in-app watch page, keeping the learner inside Langi (closed loop). Rendered as
// a sidebar on desktop and a stacked list at the bottom on mobile.
export default function RecommendedRail({ items }: { items: IVideoItem[] }) {
  if (!items.length) return null
  return (
    <aside>
      <h2 className="display font-display text-xl mb-4">Up next</h2>
      <div className="flex flex-col gap-4">
        {items.map((v) => (
          <Link key={v.videoId} href={`/videos/${v.videoId}`} className="flex gap-3 group">
            <div className="relative w-40 shrink-0 aspect-video bg-paper-dark border-2 border-line rounded-[14px] overflow-hidden">
              {v.thumbnail && (
                <Image src={v.thumbnail} alt={v.title} fill sizes="160px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                {v.title}
              </p>
              <p className="meta text-muted truncate mt-1">{v.channelTitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  )
}
