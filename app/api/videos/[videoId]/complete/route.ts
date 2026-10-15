import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import WatchHistory from '@/lib/models/WatchHistory'
import { recordStudy } from '@/lib/streak'

const FINISH_XP = 5

// POST — the learner finished this video (end / ≥95%). Marks it completed (a
// strong "show more like this" signal for ranking) and, on the FIRST ever
// completion, awards a little streak/XP.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params
  const lang = dbUser.learningLang

  await connectDB()
  const existing = await WatchHistory.findOne({ userId: dbUser._id, videoId })
  const firstCompletion = !existing?.completed

  await WatchHistory.findOneAndUpdate(
    { userId: dbUser._id, videoId },
    {
      $set: { completed: true, watchedAt: new Date(), languageCode: lang },
      $inc: { completions: 1 },
      $setOnInsert: { userId: dbUser._id, videoId },
    },
    { upsert: true }
  )

  let streak = dbUser.streak || 0
  if (firstCompletion) streak = await recordStudy(dbUser, { xp: FINISH_XP, kind: 'video' })

  return NextResponse.json({ ok: true, firstCompletion, streak })
}
