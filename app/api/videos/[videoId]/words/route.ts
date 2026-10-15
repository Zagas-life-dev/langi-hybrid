import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import Deck from '@/lib/models/Deck'
import Card from '@/lib/models/Card'

// GET → words (and lines, as their blanked word) this learner saved while
// watching this video, with timestamps.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { videoId } = await params

  await connectDB()
  const deck = await Deck.findOne({ slug: `saved-${String(dbUser._id)}-${dbUser.learningLang}` }).select('_id').lean()
  if (!deck) return NextResponse.json({ words: [] })
  const cards = await Card.find({ deckId: deck._id, 'source.kind': 'video', 'source.ref': videoId })
    .select('term translation cloze source.t')
    .lean()
  const words = cards
    .map((c) => c.cloze
      ? { term: c.cloze, translation: 'saved line', t: c.source?.t ?? null, line: true }
      : { term: c.term, translation: c.translation, t: c.source?.t ?? null, line: false })
    .sort((x, y) => (x.t ?? 1e9) - (y.t ?? 1e9))
  return NextResponse.json({ words })
}
