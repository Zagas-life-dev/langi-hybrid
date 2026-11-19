import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { cardId } = await params
  await connectDB()
  const card = await Card.findById(cardId)
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })

  // Serve the cached enrichment if present (no AI call, no rate-limit spend).
  if (card.exampleSentence) {
    return NextResponse.json({
      exampleSentence: card.exampleSentence,
      exampleTranslation: card.exampleTranslation,
      cached: true,
    })
  }

  // Not cached: the browser writes one (Firebase AI Logic) and PUTs it back.
  return NextResponse.json(
    { error: 'needs-ai', card: { term: card.term, translation: card.translation, lang: card.languageCode } },
    { status: 424 }
  )
}

// PUT {exampleSentence, exampleTranslation} → store the browser-generated example on the card.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { cardId } = await params
  const b = (await req.json().catch(() => ({}))) as { exampleSentence?: unknown; exampleTranslation?: unknown }
  const sentence = typeof b.exampleSentence === 'string' ? b.exampleSentence.trim().slice(0, 300) : ''
  if (!sentence) return NextResponse.json({ error: 'exampleSentence required' }, { status: 400 })
  await connectDB()
  const card = await Card.findById(cardId)
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  if (!card.exampleSentence) {
    card.exampleSentence = sentence
    card.exampleTranslation = typeof b.exampleTranslation === 'string' ? b.exampleTranslation.trim().slice(0, 300) : ''
    await card.save()
  }
  return NextResponse.json({ ok: true })
}
