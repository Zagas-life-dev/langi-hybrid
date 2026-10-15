import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'
import PlaylistCard, { type PlaylistCardData } from '@/components/PlaylistCard'

export const dynamic = 'force-dynamic'

function CourseSection({ title, blurb, items }: { title: string; blurb?: string; items: PlaylistCardData[] }) {
  if (!items.length) return null
  return (
    <section className="mb-12">
      <h2 className="display font-display text-2xl mb-1">{title}</h2>
      {blurb && <p className="text-muted text-sm mb-5">{blurb}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((p) => <PlaylistCard key={p.id} p={p} />)}
      </div>
    </section>
  )
}

export default async function CoursesPage() {
  const { dbUser } = await requireUser()
  const lang = dbUser.learningLang

  await connectDB()
  const [mine, official, publicOthers] = await Promise.all([
    Playlist.find({ ownerId: dbUser._id }).sort({ updatedAt: -1 }).lean(),
    Playlist.find({ isOfficial: true, languageCode: lang }).sort({ updatedAt: -1 }).lean(),
    Playlist.find({ isPublic: true, isOfficial: false, languageCode: lang, ownerId: { $ne: dbUser._id } })
      .sort({ updatedAt: -1 }).limit(60).lean(),
  ])

  const shape = (p: (typeof mine)[number]): PlaylistCardData => ({
    id: String(p._id),
    title: p.title,
    description: p.description,
    ownerName: p.ownerName,
    isCourse: p.isCourse,
    isOfficial: p.isOfficial,
    count: p.items.length,
    thumbnail: p.items[0]?.thumbnail || '',
  })

  const hasAny = mine.length || official.length || publicOthers.length

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <p className="meta text-muted mb-2">Courses & playlists</p>
          <h1 className="display font-display text-4xl sm:text-5xl">Courses</h1>
        </div>
        <Link
          href="/courses/new"
          className="inline-flex items-center gap-2 px-4 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold hover:bg-ink transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} /> New playlist
        </Link>
      </div>

      <CourseSection title="Official courses" blurb="Curated, ordered paths from the Langi team." items={official.map(shape)} />
      <CourseSection title="My playlists" blurb="Playlists and courses you've created." items={mine.map(shape)} />
      <CourseSection title="From the community" blurb="Public playlists other learners have shared." items={publicOthers.map(shape)} />

      {!hasAny && (
        <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
          <p className="display font-display text-2xl mb-3">No courses yet</p>
          <p className="text-muted mb-5">Create your first playlist and add videos to it, or check back for community courses.</p>
          <Link href="/courses/new" className="inline-flex items-center gap-2 px-4 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold">
            <Plus className="w-4 h-4" /> New playlist
          </Link>
        </div>
      )}
    </div>
  )
}
