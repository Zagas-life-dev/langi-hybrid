import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { saveSentence } from '@/lib/vocab'
import { lookupWord } from '@/lib/wordLookup'
import { cleanSource } from '@/app/api/words/save/route'

// POST {sentence, word, meaning?, source?} → a fill-in-the-blank card in the
// learner's "Saved words" deck: the subtitle line with `word` blanked out. The
// hint is `meaning` (the line in the learner's language, which the subtitle
// overlay already has); without it, the word's dictionary gloss.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { sentence?: string; word?: string; meaning?: string; source?: unknown }
  const sentence = String(body.sentence || '').trim()
  const word = String(body.word || '').trim()
  if (!sentence || !word) return NextResponse.json({ error: 'sentence and word required' }, { status: 400 })
  const lang = dbUser.learningLang

  let meaning = String(body.meaning || '').trim()
  if (!meaning) {
    const out = await lookupWord(dbUser, lang, word)
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
    meaning = `${word} — ${out.entry.translation}`
  }

  const saved = await saveSentence(dbUser, lang, sentence, word, meaning, cleanSource(body.source))
  if (!saved) return NextResponse.json({ error: 'Could not save that line.' }, { status: 400 })
  return NextResponse.json({ saved: true, ...saved })
}
