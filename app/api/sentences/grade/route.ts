import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import SentenceAttempt from '@/lib/models/SentenceAttempt'
import { checkLimit } from '@/lib/ratelimit'
import { gradeSentence } from '@/lib/ai'
import { recordActivity } from '@/lib/activity'
import { recordMistake } from '@/lib/mistakes'

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
  const { prompt, sentence } = body as { prompt?: string; sentence?: string }
  if (!prompt?.trim() || !sentence?.trim()) {
    return NextResponse.json({ error: 'prompt and sentence required' }, { status: 400 })
  }

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
  }

  try {
    const lang = dbUser.learningLang
    const grade = await gradeSentence(prompt.trim(), sentence.trim(), dbUser.cefrLevel || 'A2', lang)
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
    return NextResponse.json({ ...grade, streak: activity.streak, unlocked: activity.unlocked })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
