import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'
import { checkLimit } from '@/lib/ratelimit'
import { generateExample } from '@/lib/ai'

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

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } }
    )
  }

  try {
    const result = await generateExample(card.term, card.translation, card.languageCode)
    if (!result) return NextResponse.json({ error: 'Could not generate an example.' }, { status: 502 })
    card.exampleSentence = result.exampleSentence
    card.exampleTranslation = result.exampleTranslation
    await card.save()
    return NextResponse.json({ ...result, cached: false })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
