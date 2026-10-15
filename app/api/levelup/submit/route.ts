import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import LangiUser from '@/lib/models/LangiUser'
import { gradeLevelUp, nextLevel } from '@/lib/levelUp'
import { recordStudy } from '@/lib/streak'
import { notifyUser } from '@/lib/notify'

const PASS_XP = 100

// POST {answers:[{id, answer}]} → grade; on a pass, promote the learner one
// CEFR level. A fail starts the retry cooldown.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const target = nextLevel(dbUser.cefrLevel)
  if (!target) return NextResponse.json({ error: 'No level to move up to.' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as { answers?: unknown }
  const answers = (Array.isArray(body.answers) ? body.answers : [])
    .map((a) => ({ id: String((a as { id?: unknown })?.id ?? ''), answer: String((a as { answer?: unknown })?.answer ?? '') }))
    .slice(0, 40)

  const verdict = await gradeLevelUp(dbUser.learningLang, target, answers)

  await connectDB()
  if (verdict.passed) {
    await LangiUser.updateOne({ _id: dbUser._id }, { $set: { cefrLevel: target }, $unset: { levelUpAttemptAt: 1 } })
    await recordStudy(dbUser, { xp: PASS_XP, kind: 'review' })
    await notifyUser({
      userId: dbUser._id,
      type: 'level_up',
      title: `🎓 You're now ${target}!`,
      body: `You passed the ${target} level-up test. New decks, stories and grammar are unlocked.`,
      url: '/learn',
    }).catch(() => {})
  } else {
    await LangiUser.updateOne({ _id: dbUser._id }, { $set: { levelUpAttemptAt: new Date() } })
  }

  return NextResponse.json({ target, ...verdict })
}
