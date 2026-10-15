import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { checkLimit } from '@/lib/ratelimit'
import { generateSentencePrompt } from '@/lib/ai'
import { recentMistakeFocus } from '@/lib/mistakes'

export async function GET() {
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
    const focus = await recentMistakeFocus(dbUser._id, dbUser.learningLang)
    const prompt = await generateSentencePrompt(dbUser.cefrLevel || 'A2', dbUser.learningLang, focus)
    if (!prompt) return NextResponse.json({ error: 'Could not generate a prompt.' }, { status: 502 })
    return NextResponse.json({ prompt })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
