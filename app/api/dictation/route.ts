import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { checkLimit } from '@/lib/ratelimit'
import { generateDictation } from '@/lib/dictation'
import type { CefrLevel } from '@/lib/models/LangiUser'

// Generate a fresh batch of dictation sentences at the learner's level. Scoring
// of typed answers happens client-side (lib/pronunciation.ts).
export async function POST() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
  }

  try {
    const lines = await generateDictation({
      level: (dbUser.cefrLevel || 'A2') as CefrLevel,
      lang: dbUser.learningLang,
      nativeLang: dbUser.nativeLang,
      count: 6,
    })
    if (!lines.length) return NextResponse.json({ error: 'Could not generate dictation. Try again.' }, { status: 502 })
    return NextResponse.json({ lines })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
