import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'
import { checkLimit } from '@/lib/ratelimit'
import { generateDistractors } from '@/lib/ai'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Clean single label for the correct option (translation may pack "hi/hello").
function correctLabel(translation: string): string {
  return translation.split(/[/,;]/)[0].trim()
}

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

  const correct = correctLabel(card.translation)

  // Cached distractors → just rebuild + shuffle the options.
  if (card.distractors && card.distractors.length >= 3) {
    return NextResponse.json({ options: shuffle([correct, ...card.distractors.slice(0, 3)]), cached: true })
  }

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } }
    )
  }

  try {
    const distractors = await generateDistractors(card.term, card.translation, card.languageCode)
    if (distractors.length < 3) return NextResponse.json({ error: 'Could not generate options.' }, { status: 502 })
    card.distractors = distractors
    await card.save()
    return NextResponse.json({ options: shuffle([correct, ...distractors]), cached: false })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
