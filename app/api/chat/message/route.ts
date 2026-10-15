import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import ChatSession, { MESSAGE_CAP } from '@/lib/models/ChatSession'
import { checkLimit } from '@/lib/ratelimit'
import { tutorReply, type ChatMessage } from '@/lib/ai'
import { saveVocab, type SavedVocab } from '@/lib/vocab'
import { lexiconStore } from '@/lib/lexicon'
import { recordStudy } from '@/lib/streak'
import { recordMistake, recentMistakeFocus } from '@/lib/mistakes'

const CHAT_XP = 4

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { sessionId, content } = body as { sessionId?: string; content?: string }
  if (!sessionId || !content?.trim()) {
    return NextResponse.json({ error: 'sessionId and content required' }, { status: 400 })
  }

  await connectDB()
  const session = await ChatSession.findOne({ _id: sessionId, userId: dbUser._id })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const limit = await checkLimit(String(dbUser._id))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limit reached. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } })
  }

  session.messages.push({ role: 'user', content: content.trim(), at: new Date() })

  const history: ChatMessage[] = session.messages.map((m) => ({ role: m.role, content: m.content }))
  const level = dbUser.cefrLevel || 'A2'

  let reply = '…'
  let corrections = ''
  let corrected = ''
  let vocab: { term: string; translation: string }[] = []
  let suggestions: string[] = []
  // Only conversation weaves in weak spots; grammar-help mode answers questions.
  const focus = session.mode === 'conversation' ? await recentMistakeFocus(dbUser._id, session.languageCode, 3) : []
  try {
    const out = await tutorReply({ history, mode: session.mode, topic: session.topic, scenario: session.scenario, level, lang: session.languageCode, focus })
    reply = out.reply
    corrections = out.corrections
    corrected = out.corrected
    vocab = out.vocab
    suggestions = out.suggestions
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI unavailable' }, { status: 503 })
  }

  // A tutor correction becomes a Mistakes-deck item to re-practise later.
  if (corrections && corrected) {
    await recordMistake(dbUser._id, session.languageCode, {
      source: 'chat',
      prompt: content.trim(),
      answer: corrected,
      userAnswer: content.trim(),
      note: corrections,
    })
  }

  // Auto-add words the learner asked about to their SRS study deck, and enrich
  // the shared dictionary (free — the tutor already provided the translation).
  const savedWords: SavedVocab[] = []
  for (const v of vocab) {
    const saved = await saveVocab(dbUser, session.languageCode, v.term, v.translation)
    if (saved) savedWords.push(saved)
    await lexiconStore(session.languageCode, v.term, { translation: v.translation }, 'tutor')
  }

  session.messages.push({ role: 'assistant', content: reply, corrections: corrections || undefined, at: new Date() })
  // Cap persisted history to the most recent MESSAGE_CAP entries.
  if (session.messages.length > MESSAGE_CAP) {
    session.messages = session.messages.slice(-MESSAGE_CAP)
  }
  session.messageCount += 2
  await session.save()

  // Chatting counts toward the daily habit, like reviews and watching.
  const streak = await recordStudy(dbUser, { xp: CHAT_XP, kind: 'chat' })

  return NextResponse.json({ reply, corrections, savedWords, suggestions, streak })
}
