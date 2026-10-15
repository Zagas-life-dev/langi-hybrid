import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDueCards, clozePrompt, type ReviewDirection } from '@/lib/srs'

export async function GET(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const deckId = req.nextUrl.searchParams.get('deckId') || undefined
  const direction = (req.nextUrl.searchParams.get('direction') || 'recognition') as ReviewDirection
  const lang = dbUser.learningLang

  const due = await getDueCards(String(dbUser._id), lang, deckId)

  // Map to a SAFE shape — never send the answer side to the client.
  const items = due.map(({ card, userCard }) => card.cloze
    // Sentence cards read the same both ways: fill the blank, with the
    // sentence's meaning as the hint.
    ? {
        cardId: String(card._id),
        box: userCard?.box ?? 1,
        isNew: !userCard,
        prompt: clozePrompt(card.term, card.cloze),
        hint: card.translation,
        cloze: true,
        answerLang: lang,
        tags: card.tags,
      }
    : {
        cardId: String(card._id),
        box: userCard?.box ?? 1,
        isNew: !userCard,
        prompt: direction === 'production' ? card.translation : card.term,
        partOfSpeech: card.partOfSpeech,
        // gender belongs to the French term — only reveal it in recognition mode.
        gender: direction === 'recognition' ? card.gender : undefined,
        answerLang: direction === 'production' ? lang : dbUser.nativeLang,
        tags: card.tags,
      })

  return NextResponse.json({ direction, count: items.length, items })
}
