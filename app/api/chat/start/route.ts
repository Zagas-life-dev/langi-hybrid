import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession from '@/lib/models/ChatSession'
import { scenarioByKey } from '@/lib/scenarios'

type ChatMode = 'conversation' | 'grammar'

// POST → create a chat session. The opener is generated in the browser (Firebase AI Logic)
// and sent here as `starter`, so this route never calls a model.
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
  // Role-play scenario (validated) takes precedence over a free-chat topic.
  const scenario = mode === 'conversation' && scenarioByKey(body.scenario) ? String(body.scenario) : undefined
  const topic = mode === 'conversation' && !scenario && typeof body.topic === 'string' && body.topic.trim()
    ? body.topic.trim().slice(0, 120)
    : undefined

  const starter = body.starter as { opener?: unknown; translation?: unknown; suggestions?: unknown } | undefined
  const messages: { role: 'assistant'; content: string; corrections?: string; at: Date }[] = []
  let suggestions: string[] = []
  if (mode === 'conversation' && typeof starter?.opener === 'string' && starter.opener.trim()) {
    messages.push({
      role: 'assistant',
      content: starter.opener.trim().slice(0, 1000),
      corrections: typeof starter.translation === 'string' ? starter.translation.trim().slice(0, 1000) : undefined,
      at: new Date(),
    })
    suggestions = Array.isArray(starter.suggestions)
      ? starter.suggestions.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 3)
      : []
  }

  await connectDB()
  const session = await ChatSession.create({
    userId: dbUser._id,
    languageCode: lang,
    mode,
    topic,
    scenario,
    messages,
    messageCount: messages.length,
  })

  // Auto-prune: keep only this user's most recent sessions.
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
