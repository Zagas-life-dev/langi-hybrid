import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Playlist from '@/lib/models/Playlist'
import type { CefrLevel } from '@/lib/models/LangiUser'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
function coerceLevel(v: unknown): CefrLevel | null {
  const s = String(v || '').toUpperCase()
  return (LEVELS.includes(s) ? s : null) as CefrLevel | null
}

// GET — playlists relevant to the learner's language: their own, admin-official
// courses, and other users' public playlists.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const lang = dbUser.learningLang
  const [mine, official, publicOthers] = await Promise.all([
    Playlist.find({ ownerId: dbUser._id }).sort({ updatedAt: -1 }).lean(),
    Playlist.find({ isOfficial: true, languageCode: lang }).sort({ updatedAt: -1 }).lean(),
    Playlist.find({ isPublic: true, isOfficial: false, languageCode: lang, ownerId: { $ne: dbUser._id } })
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean(),
  ])
  const shape = (p: (typeof mine)[number]) => ({
    id: String(p._id),
    title: p.title,
    description: p.description,
    ownerName: p.ownerName,
    isCourse: p.isCourse,
    isPublic: p.isPublic,
    isOfficial: p.isOfficial,
    level: p.level,
    count: p.items.length,
    thumbnail: p.items[0]?.thumbnail || '',
  })
  return NextResponse.json({
    mine: mine.map(shape),
    official: official.map(shape),
    publicOthers: publicOthers.map(shape),
  })
}

// POST {title, description?, isCourse?, isPublic?, level?} — create a playlist.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const title = String((body as { title?: string }).title || '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  await connectDB()
  const created = await Playlist.create({
    ownerId: dbUser._id,
    ownerName: dbUser.displayName || dbUser.email?.split('@')[0] || 'Learner',
    languageCode: dbUser.learningLang,
    title: title.slice(0, 120),
    description: String((body as { description?: string }).description || '').slice(0, 500),
    isCourse: Boolean((body as { isCourse?: boolean }).isCourse),
    isPublic: Boolean((body as { isPublic?: boolean }).isPublic),
    level: coerceLevel((body as { level?: string }).level),
  })
  return NextResponse.json({ id: String(created._id) })
}
