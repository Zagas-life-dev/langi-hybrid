import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { buildLevelUpForm, nextLevel, RETRY_COOLDOWN_MS } from '@/lib/levelUp'

// GET → a fresh level-up test for the learner's NEXT level (answers stripped).
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const target = nextLevel(dbUser.cefrLevel)
  if (!dbUser.cefrLevel) return NextResponse.json({ error: 'Take the placement test first.' }, { status: 400 })
  if (!target) return NextResponse.json({ error: 'You are already at the top level (C2).' }, { status: 400 })

  const last = dbUser.levelUpAttemptAt ? new Date(dbUser.levelUpAttemptAt).getTime() : 0
  const retryAt = last + RETRY_COOLDOWN_MS
  if (retryAt > Date.now()) {
    return NextResponse.json({ error: 'cooldown', retryAt: new Date(retryAt).toISOString(), target }, { status: 429 })
  }

  const questions = await buildLevelUpForm(dbUser.learningLang, target)
  if (questions.length < 6) {
    return NextResponse.json({ error: `Not enough ${target} content yet for a level-up test.` }, { status: 404 })
  }
  return NextResponse.json({ from: dbUser.cefrLevel, target, questions })
}
