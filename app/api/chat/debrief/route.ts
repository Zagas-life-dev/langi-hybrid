import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession from '@/lib/models/ChatSession'
import { recordStudy } from '@/lib/streak'

// POST {sessionId, score} → award XP for a scored role-play. The scoring itself ran in the
// browser (Firebase AI Logic "deepDive" task); this route only records the result.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId, score } = (await req.json().catch(() => ({}))) as { sessionId?: string; score?: number }
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  await connectDB()
  const session = await ChatSession.findOne({ _id: sessionId, userId: dbUser._id })
  if (!session?.scenario) return NextResponse.json({ error: 'Not a role-play session' }, { status: 404 })

  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)))
  await recordStudy(dbUser, { xp: Math.round(s / 10), kind: 'chat' })
  return NextResponse.json({ ok: true })
}
