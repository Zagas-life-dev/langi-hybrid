import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'
import Deck from '@/lib/models/Deck'
import UserCard from '@/lib/models/UserCard'
import ReviewLog from '@/lib/models/ReviewLog'
import { checkAnswer, grade, type ReviewDirection } from '@/lib/srs'
import { recordActivity } from '@/lib/activity'

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { cardId, answer = '', direction = 'recognition', spoken = false, aiAccepted = false } = body as {
    cardId?: string
    answer?: string
    direction?: ReviewDirection
    spoken?: boolean
    // The browser's on-device AI (Firebase AI Logic) judged a rule-miss to be a valid answer.
    aiAccepted?: boolean
  }
  if (!cardId) return NextResponse.json({ error: 'cardId required' }, { status: 400 })

  await connectDB()
  const card = await Card.findById(cardId)
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  const deck = await Deck.findById(card.deckId).lean()
  const deckTolerance = deck?.answerTolerance ?? 'lenient'

  const correct = checkAnswer(card, answer, direction, deckTolerance, spoken)
    || (aiAccepted === true && !card.cloze && String(answer).trim().length > 0)

  let uc = await UserCard.findOne({ userId: dbUser._id, cardId: card._id })
  const prev = uc
    ? { box: uc.box, correctStreak: uc.correctStreak, lapses: uc.lapses, reps: uc.reps }
    : { box: 1, correctStreak: 0, lapses: 0, reps: 0 }
  const boxBefore = prev.box

  const result = grade(prev, correct)

  if (!uc) {
    uc = await UserCard.create({
      userId: dbUser._id,
      cardId: card._id,
      languageCode: card.languageCode,
      box: result.box,
      dueAt: result.dueAt,
      lastReviewedAt: new Date(),
      correctStreak: result.correctStreak,
      lapses: result.lapses,
      reps: result.reps,
    })
  } else {
    uc.box = result.box
    uc.dueAt = result.dueAt
    uc.lastReviewedAt = new Date()
    uc.correctStreak = result.correctStreak
    uc.lapses = result.lapses
    uc.reps = result.reps
    await uc.save()
  }

  await ReviewLog.create({
    userId: dbUser._id,
    cardId: card._id,
    result: correct ? 'correct' : 'incorrect',
    boxBefore,
    boxAfter: result.box,
  })

  // Streak + XP + daily goal + achievements (centralised).
  const activity = await recordActivity(dbUser, { kind: 'review', correct, xp: correct ? 10 : 3 })

  return NextResponse.json({
    correct,
    newBox: result.box,
    boxBefore,
    correctAnswer: card.cloze ?? (direction === 'production' ? card.term : card.translation),
    term: card.term,
    translation: card.translation,
    gender: card.gender,
    exampleSentence: card.exampleSentence,
    exampleTranslation: card.exampleTranslation,
    // Saved words remember where they were found (video moment / story).
    source: card.source ? { kind: card.source.kind, ref: card.source.ref, t: card.source.t } : undefined,
    streak: activity.streak,
    goal: activity.goal,
    goalProgress: activity.goalProgress,
    goalMet: activity.goalMet,
    newlyMetGoal: activity.newlyMetGoal,
    unlocked: activity.unlocked,
  })
}
