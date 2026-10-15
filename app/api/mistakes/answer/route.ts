import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Mistake from '@/lib/models/Mistake'
import { grade, BOX_COUNT } from '@/lib/srs'
import { recordActivity } from '@/lib/activity'

// Self-graded recall: the learner reveals the correction, then says whether they
// got it. Applies Leitner SRS; once it graduates to the top box it's retired.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mistakeId, correct } = (await req.json().catch(() => ({}))) as {
    mistakeId?: string
    correct?: boolean
  }
  if (!mistakeId || typeof correct !== 'boolean') {
    return NextResponse.json({ error: 'mistakeId and correct required' }, { status: 400 })
  }

  await connectDB()
  const m = await Mistake.findOne({ _id: mistakeId, userId: dbUser._id })
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = grade(
    { box: m.box, correctStreak: m.correctStreak, lapses: m.lapses, reps: m.reps },
    correct
  )
  const resolved = result.box >= BOX_COUNT
  m.box = result.box
  m.dueAt = result.dueAt
  m.correctStreak = result.correctStreak
  m.lapses = result.lapses
  m.reps = result.reps
  m.lastReviewedAt = new Date()
  m.resolved = resolved
  await m.save()

  const activity = await recordActivity(dbUser, { kind: 'mistake', correct, xp: correct ? 6 : 2 })

  return NextResponse.json({
    ok: true,
    newBox: result.box,
    resolved,
    streak: activity.streak,
    newlyMetGoal: activity.newlyMetGoal,
    unlocked: activity.unlocked,
  })
}
