import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession from '@/lib/models/ChatSession'

// GET → the learner's most recent chat session (for "Resume last chat"), or null.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const s = await ChatSession.findOne({ userId: dbUser._id }).sort({ updatedAt: -1 }).lean()
  if (!s || !s.messages?.length) return NextResponse.json({ session: null })
  return NextResponse.json({
    session: {
      sessionId: String(s._id),
      mode: s.mode,
      topic: s.topic ?? null,
      scenario: s.scenario ?? null,
      messages: s.messages.map((m) => ({ role: m.role, content: m.content, corrections: m.corrections })),
      updatedAt: s.updatedAt,
    },
  })
}
