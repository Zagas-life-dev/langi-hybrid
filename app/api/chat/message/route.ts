import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession, { MESSAGE_CAP } from '@/lib/models/ChatSession'
import { saveVocab, type SavedVocab } from '@/lib/vocab'
import { lexiconStore } from '@/lib/lexicon'
import { recordStudy } from '@/lib/streak'
import { recordMistake } from '@/lib/mistakes'

const CHAT_XP = 4
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

// POST {sessionId, content, ai} → save one chat turn. The tutor reply (`ai`) was produced in
// the browser through Firebase AI Logic; this route only persists it and updates study state.
export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { sessionId, content, ai } = body as {
    sessionId?: string
    content?: string
    ai?: { reply?: unknown; corrections?: unknown; corrected?: unknown; vocab?: unknown }
  }
  if (!sessionId || !content?.trim() || !ai) {
    return NextResponse.json({ error: 'sessionId, content and ai required' }, { status: 400 })
  }

  await connectDB()
  const session = await ChatSession.findOne({ _id: sessionId, userId: dbUser._id })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const userText = clip(content, 2000)
  const reply = clip(ai.reply, 4000) || '…'
  const corrections = clip(ai.corrections, 1000)
  const corrected = clip(ai.corrected, 1000)
  const vocab = (Array.isArray(ai.vocab) ? ai.vocab : [])
    .map((v) => ({ term: clip((v as { term?: unknown })?.term, 80), translation: clip((v as { translation?: unknown })?.translation, 120) }))
    .filter((v) => v.term && v.translation)
    .slice(0, 3)

  session.messages.push({ role: 'user', content: userText, at: new Date() })

  // A tutor correction becomes a Mistakes-deck item to re-practise later.
  if (corrections && corrected) {
    await recordMistake(dbUser._id, session.languageCode, {
      source: 'chat',
      prompt: userText,
      answer: corrected,
      userAnswer: userText,
      note: corrections,
    })
  }

  // Auto-add words the learner asked about to their SRS study deck.
  const savedWords: SavedVocab[] = []
  for (const v of vocab) {
    const saved = await saveVocab(dbUser, session.languageCode, v.term, v.translation)
    if (saved) savedWords.push(saved)
    await lexiconStore(session.languageCode, v.term, { translation: v.translation }, 'tutor')
  }

  session.messages.push({ role: 'assistant', content: reply, corrections: corrections || undefined, at: new Date() })
  if (session.messages.length > MESSAGE_CAP) {
    session.messages = session.messages.slice(-MESSAGE_CAP)
  }
  session.messageCount += 2
  await session.save()

  const streak = await recordStudy(dbUser, { xp: CHAT_XP, kind: 'chat' })
  return NextResponse.json({ savedWords, streak })
}
