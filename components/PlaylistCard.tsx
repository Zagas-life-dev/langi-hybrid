import Image from 'next/image'
import Link from 'next/link'
import { ListVideo, GraduationCap } from 'lucide-react'

export interface PlaylistCardData {
  id: string
  title: string
  description?: string
  ownerName?: string
  isCourse: boolean
  isOfficial?: boolean
  count: number
  thumbnail?: string
}

export default function PlaylistCard({ p }: { p: PlaylistCardData }) {
  return (
    <Link href={`/courses/${p.id}`} className="brut-card overflow-hidden group">
      <div className="relative aspect-video bg-paper-dark border-b border-line">
        {p.thumbnail ? (
          <Image src={p.thumbnail} alt={p.title} fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted">
            <ListVideo className="w-10 h-10" strokeWidth={1.25} />
          </div>
        )}
        <span className="absolute bottom-2 right-2 bg-purple text-on-purple meta px-2 py-1">{p.count} videos</span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          {p.isCourse && <GraduationCap className="w-4 h-4 text-accent shrink-0" strokeWidth={2.2} />}
          <p className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">{p.title}</p>
        </div>
        <p className="meta text-muted truncate">
          {p.isOfficial ? 'Official' : p.ownerName ? `by ${p.ownerName}` : ''}
        </p>
      </div>
    </Link>
  )
}
