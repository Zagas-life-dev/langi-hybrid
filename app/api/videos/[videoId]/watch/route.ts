import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import WatchHistory from '@/lib/models/WatchHistory'
import { getVideoMeta } from '@/lib/youtube'
import { upsertVideoDoc } from '@/lib/videoIndex'
import { recordStudy } from '@/lib/streak'

const WATCH_XP = 5

// POST {playlistId?} — record that the user watched this video. Indexes the
// video, refreshes watch history, and (on the FIRST ever watch) awards
// streak/XP so watching feeds the same habit loop as reviews.
export async function POST(req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  const body = await req.json().catch(() => ({}))
  const playlistId = (body as { playlistId?: string }).playlistId
  const lang = dbUser.learningLang

  await connectDB()
  const already = await WatchHistory.findOne({ userId: dbUser._id, videoId })

  await WatchHistory.findOneAndUpdate(
    { userId: dbUser._id, videoId },
    {
      $set: { watchedAt: new Date(), languageCode: lang, ...(playlistId ? { playlistId } : {}) },
      $setOnInsert: { userId: dbUser._id, videoId },
    },
    { upsert: true }
  )

  // Keep the canonical index fresh (cheap; meta likely cached).
  const meta = await getVideoMeta(videoId, lang)
  if (meta) await upsertVideoDoc(meta, lang)

  let streak = dbUser.streak || 0
  if (!already) streak = await recordStudy(dbUser, { xp: WATCH_XP, kind: 'video' })

  return NextResponse.json({ ok: true, firstWatch: !already, streak })
}
