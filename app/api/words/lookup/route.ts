import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { lookupWord } from '@/lib/wordLookup'

// POST {term, lang?} → translation only (nothing is saved). Tapping a word shows
// its meaning first; the learner decides whether it's worth a flashcard.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { term?: string; lang?: string; entry?: unknown }
  const lang = String(body.lang || dbUser.learningLang || 'fr')
  const out = await lookupWord(dbUser, lang, String(body.term || ''), body.entry)
  if (!out.ok) {
    return NextResponse.json(
      { error: out.error, needsAi: out.needsAi },
      { status: out.status, headers: out.retryAfter ? { 'Retry-After': String(out.retryAfter) } : undefined }
    )
  }
  return NextResponse.json({
    term: String(body.term).trim(),
    translation: out.entry.translation,
    partOfSpeech: out.entry.partOfSpeech ?? null,
    gender: out.entry.gender ?? null,
    level: out.entry.level ?? null,
    cached: out.cached,
  })
}
