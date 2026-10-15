import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Deck from '@/lib/models/Deck'
import { getDueCards } from '@/lib/srs'
import type { AnswerTolerance } from '@/lib/models/Deck'

// Offline flashcard pack. Unlike /api/review/due (which hides the answer side so
// it can't be peeked before the learner responds), this endpoint ships the FULL
// card — term, translation, accepted answers, per-card/deck tolerance, example —
// so the device can grade a review with zero network (lib/offlineCards.ts +
// srs-core.checkAnswer). It's meant to be fetched while online and stashed in
// IndexedDB; the answers only surface after the learner submits, exactly as
// online. On reconnect the queued answers are re-graded server-side (authoritative).
export async function GET(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const deckId = req.nextUrl.searchParams.get('deckId') || undefined
  const lang = dbUser.learningLang

  await connectDB()
  const due = await getDueCards(String(dbUser._id), lang, deckId)

  // Per-deck tolerance so local grading matches the server's checkAnswer exactly.
  const deckIds = [...new Set(due.map(({ card }) => String(card.deckId)))]
  const decks = await Deck.find({ _id: { $in: deckIds } }).select('_id answerTolerance').lean()
  const tolByDeck = new Map<string, AnswerTolerance>(
    decks.map((d) => [String(d._id), (d.answerTolerance as AnswerTolerance) ?? 'lenient'])
  )

  const cards = due.map(({ card, userCard }) => ({
    cardId: String(card._id),
    deckId: String(card.deckId),
    languageCode: card.languageCode,
    term: card.term,
    translation: card.translation,
    acceptedAnswers: card.acceptedAnswers ?? [],
    cloze: card.cloze,
    answerTolerance: card.answerTolerance, // per-card override, may be undefined
    deckTolerance: tolByDeck.get(String(card.deckId)) ?? 'lenient',
    partOfSpeech: card.partOfSpeech,
    gender: card.gender,
    exampleSentence: card.exampleSentence,
    exampleTranslation: card.exampleTranslation,
    tags: card.tags ?? [],
    box: userCard?.box ?? 1,
    isNew: !userCard,
    dueAt: (userCard?.dueAt ?? new Date()).valueOf(),
  }))

  return NextResponse.json({
    learningLang: lang,
    nativeLang: dbUser.nativeLang,
    deckId: deckId ?? 'all',
    savedAt: Date.now(),
    count: cards.length,
    cards,
  })
}
