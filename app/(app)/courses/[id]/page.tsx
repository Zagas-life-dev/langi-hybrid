import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, Play, Check, GraduationCap } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'
import { isAdmin } from '@/lib/admin'
import { watchedVideoIds } from '@/lib/ranking'
import PlaylistManage from '@/components/PlaylistManage'

export const dynamic = 'force-dynamic'

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { dbUser, supabaseUser } = await requireUser()
  const { id } = await params
  const admin = isAdmin(supabaseUser.email)

  await connectDB()
  const p = await Playlist.findById(id).lean().catch(() => null)
  if (!p) notFound()

  const isOwner = String(p.ownerId) === String(dbUser._id)
  if (!isOwner && !p.isPublic && !p.isOfficial && !admin) notFound()

  const items = [...p.items].sort((a, b) => a.order - b.order)
  const watched = await watchedVideoIds(dbUser._id as Parameters<typeof watchedVideoIds>[0], p.languageCode)
  const doneCount = items.filter((i) => watched.has(i.videoId)).length
  const firstUnwatched = items.find((i) => !watched.has(i.videoId)) || items[0]
  const startLabel = doneCount > 0 && doneCount < items.length ? 'Continue' : 'Start'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <Link href="/courses" className="inline-flex items-center gap-2 meta text-muted hover:text-accent mb-5">
        <ArrowLeft className="w-4 h-4" /> Courses
      </Link>

      <div className="flex items-center gap-2 mb-1">
        {p.isCourse && <GraduationCap className="w-5 h-5 text-accent" strokeWidth={2.2} />}
        <h1 className="display font-display text-4xl">{p.title}</h1>
      </div>
      <p className="meta text-muted mb-3">
        {p.isOfficial ? 'Official course' : `by ${p.ownerName}`} · {items.length} videos
      </p>
      {p.description && <p className="text-ink-soft mb-5 max-w-2xl">{p.description}</p>}

      {/* Progress */}
      {items.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="meta text-muted">{doneCount} / {items.length} watched</span>
            <span className="meta text-muted">{Math.round((doneCount / items.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-paper-dark border-2 border-line rounded-full">
            <div className="h-full bg-accent" style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
        </div>
      )}

      {firstUnwatched && (
        <Link
          href={`/videos/${firstUnwatched.videoId}?list=${String(p._id)}`}
          className="inline-flex items-center gap-2 px-5 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold hover:bg-ink transition-colors mb-8"
        >
          <Play className="w-4 h-4" fill="currentColor" /> {startLabel}
        </Link>
      )}

      <PlaylistManage
        id={String(p._id)}
        isOwner={isOwner}
        isAdmin={admin}
        initialPublic={p.isPublic}
        initialCourse={p.isCourse}
        initialOfficial={p.isOfficial}
      />

      <ol className="space-y-3">
        {items.map((it, i) => {
          const done = watched.has(it.videoId)
          return (
            <li key={it.videoId}>
              <Link
                href={`/videos/${it.videoId}?list=${String(p._id)}`}
                className="flex items-center gap-4 border-[2.5px] border-line rounded-[24px] p-2 hover:bg-paper-dark transition-colors group"
              >
                <span className="meta text-muted w-6 text-center shrink-0">{i + 1}</span>
                <div className="relative w-28 shrink-0 aspect-video bg-paper-dark border-2 border-line rounded-[14px] overflow-hidden">
                  {it.thumbnail && <Image src={it.thumbnail} alt={it.title} fill sizes="112px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">{it.title}</p>
                  <p className="meta text-muted truncate">{it.channelTitle}</p>
                </div>
                {done && <Check className="w-5 h-5 text-accent shrink-0" strokeWidth={2} />}
              </Link>
            </li>
          )
        })}
        {items.length === 0 && <li className="text-muted text-sm">No videos yet. {isOwner ? 'Add some above.' : ''}</li>}
      </ol>
    </div>
  )
}
