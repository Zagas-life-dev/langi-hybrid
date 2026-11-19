import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import SentenceAttempt from '@/lib/models/SentenceAttempt'
import { recordActivity } from '@/lib/activity'
import { recordMistake } from '@/lib/mistakes'

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// POST {prompt, sentence, grade} → save an attempt. The grade was produced in the browser
// (Firebase AI Logic); this route only persists it and updates study state.
// Translations scoring below this become Mistakes-deck items to re-practise.
const MISTAKE_THRESHOLD = 70

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt, sentence, grade: g } = body as { prompt?: string; sentence?: string; grade?: { score?: unknown; feedback?: unknown; correction?: unknown } }
  if (!prompt?.trim() || !sentence?.trim() || !g) {
    return NextResponse.json({ error: 'prompt, sentence and grade required' }, { status: 400 })
  }
  const n = Number(g.score)
  const grade = {
    score: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0,
    feedback: clip(g.feedback, 600),
    correction: clip(g.correction, 400),
  }

  try {
    const lang = dbUser.learningLang
    await connectDB()
    await SentenceAttempt.create({
      userId: dbUser._id,
      languageCode: lang,
      prompt: prompt.trim(),
      userSentence: sentence.trim(),
      correction: grade.correction,
      feedback: grade.feedback,
      score: grade.score,
    })

    // A weak translation becomes a Mistakes-deck item to re-practise later.
    if (grade.score < MISTAKE_THRESHOLD && grade.correction) {
      await recordMistake(dbUser._id, lang, {
        source: 'sentence',
        prompt: prompt.trim(),
        answer: grade.correction,
        userAnswer: sentence.trim(),
        note: grade.feedback,
      })
    }

    // Sentence practice counts toward the daily habit.
    const activity = await recordActivity(dbUser, { kind: 'sentence', xp: 5 })
    return NextResponse.json({ streak: activity.streak, unlocked: activity.unlocked })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Could not save' }, { status: 500 })
  }
}
