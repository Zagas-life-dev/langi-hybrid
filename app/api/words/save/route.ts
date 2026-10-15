import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { saveVocab } from '@/lib/vocab'
import { lookupWord } from '@/lib/wordLookup'
import { invalidateKnowledge } from '@/lib/wordKnowledge'
import type { CardSource } from '@/lib/models/Card'

const SOURCE_KINDS = new Set(['video', 'story', 'chat', 'dictation'])

/** Accept only a well-formed source; anything else is dropped, not rejected. */
export function cleanSource(raw: unknown): CardSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (!SOURCE_KINDS.has(String(r.kind))) return undefined
  const t = Number(r.t)
  return {
    kind: r.kind as CardSource['kind'],
    ref: typeof r.ref === 'string' ? r.ref.slice(0, 64) : undefined,
    t: Number.isFinite(t) && t >= 0 ? Math.floor(t) : undefined,
    context: typeof r.context === 'string' ? r.context.trim().slice(0, 300) : undefined,
  }
}

// POST {term, lang?, source?} → translate (dictionary-first) and add the word to
// the learner's "Saved words" deck as a due SRS card, remembering where it was
// found. Used by every tap-a-word surface and the video "save word" box.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { term?: string; lang?: string; source?: unknown }
  const term = String(body.term || '').trim()
  const lang = String(body.lang || dbUser.learningLang || 'fr')

  const out = await lookupWord(dbUser, lang, term)
  if (!out.ok) {
    return NextResponse.json(
      { error: out.error },
      { status: out.status, headers: out.retryAfter ? { 'Retry-After': String(out.retryAfter) } : undefined }
    )
  }

  const saved = await saveVocab(dbUser, lang, term, out.entry.translation, {
    partOfSpeech: out.entry.partOfSpeech,
    gender: out.entry.gender,
    level: out.entry.level ?? undefined,
    source: cleanSource(body.source),
  })
  if (!saved) return NextResponse.json({ error: 'Could not save that word.' }, { status: 502 })
  invalidateKnowledge(dbUser)

  return NextResponse.json({
    saved: true,
    alreadySaved: saved.alreadySaved,
    cached: out.cached,
    card: { term: saved.term, translation: saved.translation, gender: saved.gender, level: out.entry.level ?? null },
  })
}
