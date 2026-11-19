import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'

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

  // Not cached: the browser writes them (Firebase AI Logic) and PUTs them back.
  return NextResponse.json(
    { error: 'needs-ai', card: { term: card.term, translation: card.translation, lang: card.languageCode } },
    { status: 424 }
  )
}

// PUT {distractors} → store the browser-generated wrong options and return the shuffled choices.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  try {
    await requireUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { cardId } = await params
  const b = (await req.json().catch(() => ({}))) as { distractors?: unknown }
  const list = (Array.isArray(b.distractors) ? b.distractors : [])
    .map((s) => String(s).trim().slice(0, 120)).filter(Boolean).slice(0, 3)
  if (list.length < 3) return NextResponse.json({ error: 'Need 3 distractors' }, { status: 400 })
  await connectDB()
  const card = await Card.findById(cardId)
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  if (!card.distractors || card.distractors.length < 3) {
    card.distractors = list
    await card.save()
  }
  return NextResponse.json({ options: shuffle([correctLabel(card.translation), ...list]) })
}
