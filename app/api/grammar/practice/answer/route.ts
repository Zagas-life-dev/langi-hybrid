import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import GrammarQuestion from '@/lib/models/GrammarQuestion'
import GrammarQuestionState from '@/lib/models/GrammarQuestionState'
import { grade } from '@/lib/srs'
import { recordActivity } from '@/lib/activity'
import { recordMistake } from '@/lib/mistakes'

// Answer a grammar-concept MCQ: check it, advance its Leitner state, file a
// Mistake on a miss, and count the practice toward the daily goal.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { questionId, choice } = (await req.json().catch(() => ({}))) as {
    questionId?: string
    choice?: number
  }
  if (!questionId || typeof choice !== 'number') {
    return NextResponse.json({ error: 'questionId and choice required' }, { status: 400 })
  }

  await connectDB()
  const q = await GrammarQuestion.findById(questionId).lean()
  if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  const correct = choice === q.answerIndex
  const lang = q.languageCode

  const st = await GrammarQuestionState.findOne({ userId: dbUser._id, questionId: q._id })
  const prev = st
    ? { box: st.box, correctStreak: st.correctStreak, lapses: st.lapses, reps: st.reps }
    : { box: 1, correctStreak: 0, lapses: 0, reps: 0 }
  const result = grade(prev, correct)

  await GrammarQuestionState.findOneAndUpdate(
    { userId: dbUser._id, questionId: q._id },
    {
      $set: {
        languageCode: lang,
        box: result.box,
        dueAt: result.dueAt,
        lastReviewedAt: new Date(),
        correctStreak: result.correctStreak,
        lapses: result.lapses,
        reps: result.reps,
      },
    },
    { upsert: true }
  )

  // A missed concept question becomes a re-practisable Mistake.
  if (!correct) {
    await recordMistake(dbUser._id, lang, {
      source: 'grammar',
      prompt: q.prompt,
      answer: q.options[q.answerIndex],
      userAnswer: q.options[choice] ?? '',
      note: q.explanation,
    })
  }

  const activity = await recordActivity(dbUser, { kind: 'grammar', correct, xp: correct ? 6 : 2 })

  return NextResponse.json({
    correct,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    newBox: result.box,
    streak: activity.streak,
    newlyMetGoal: activity.newlyMetGoal,
    unlocked: activity.unlocked,
  })
}
