import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession from '@/lib/models/ChatSession'
import { checkLimit } from '@/lib/ratelimit'
import { recentMistakeFocus } from '@/lib/mistakes'
import { conversationStarter, randomTopic, scenarioByKey, type ChatMode } from '@/lib/ai'

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const mode = (body.mode === 'grammar' ? 'grammar' : 'conversation') as ChatMode
  const lang = dbUser.learningLang
  const level = dbUser.cefrLevel || 'A2'
  // Role-play scenario (validated) takes precedence over a free-chat topic.
  const scenario = mode === 'conversation' && scenarioByKey(body.scenario) ? String(body.scenario) : undefined
  const topic = mode === 'conversation' && !scenario
    ? (typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : randomTopic())
    : undefined

  await connectDB()
  const messages: { role: 'assistant'; content: string; corrections?: string; at: Date }[] = []
  let suggestions: string[] = []

  if (mode === 'conversation') {
    const limit = await checkLimit(String(dbUser._id))
    if (!limit.ok) {
      return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
    }
    try {
      const focus = await recentMistakeFocus(dbUser._id, lang, 3)
      const starter = await conversationStarter({ topic, scenario, level, lang, focus })
      if (starter) {
        messages.push({ role: 'assistant', content: starter.opener, corrections: starter.translation, at: new Date() })
        suggestions = starter.suggestions
      }
    } catch {
      // Fall back to an empty session if the opener fails.
    }
  }

  const session = await ChatSession.create({
    userId: dbUser._id,
    languageCode: lang,
    mode,
    topic,
    scenario,
    messages,
    messageCount: messages.length,
  })

  // Auto-prune: keep only this user's most recent sessions so old chats don't
  // pile up (the learning payload — vocab — already lives in the SRS deck).
  const KEEP = 20
  const stale = await ChatSession.find({ userId: dbUser._id })
    .sort({ updatedAt: -1 }).skip(KEEP).select('_id').lean()
  if (stale.length) {
    await ChatSession.deleteMany({ _id: { $in: stale.map((s) => s._id) } })
  }

  return NextResponse.json({
    sessionId: String(session._id),
    mode,
    topic,
    scenario,
    suggestions,
    messages: messages.map((m) => ({ role: m.role, content: m.content, corrections: m.corrections })),
  })
}
