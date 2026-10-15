import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession from '@/lib/models/ChatSession'
import { checkLimit } from '@/lib/ratelimit'
import { scenarioDebrief } from '@/lib/ai'
import { recordStudy } from '@/lib/streak'

// POST {sessionId} → score a finished role-play against its goals. Awards a
// little XP scaled by the score so finishing a scene feels worth it.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  await connectDB()
  const session = await ChatSession.findOne({ _id: sessionId, userId: dbUser._id })
  if (!session?.scenario) return NextResponse.json({ error: 'Not a role-play session' }, { status: 404 })
  if (!session.messages.some((m) => m.role === 'user')) {
    return NextResponse.json({ error: 'Say something in the scene first!' }, { status: 400 })
  }

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
  }

  try {
    const debrief = await scenarioDebrief({
      history: session.messages.map((m) => ({ role: m.role, content: m.content })),
      scenario: session.scenario,
      level: dbUser.cefrLevel || 'A2',
      lang: session.languageCode,
    })
    if (!debrief) return NextResponse.json({ error: 'Could not score this scene.' }, { status: 502 })
    await recordStudy(dbUser, { xp: Math.round(debrief.score / 10), kind: 'chat' })
    return NextResponse.json(debrief)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }
}
