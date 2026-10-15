import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import GrammarQuestion from '@/lib/models/GrammarQuestion'
import { getDueMistakes } from '@/lib/mistakes'
import { getDueGrammarQuestions } from '@/lib/grammar-practice'

// Offline learning bundle: the due MISTAKES deck and due GRAMMAR-concept
// questions, each shipped WITH its answer so they can be practised + graded fully
// offline (mirrors /api/review/pack for flashcards). Fetched while online and
// cached in IndexedDB (lib/offlineData.ts). Answers are only revealed after the
// learner responds, exactly as online; on reconnect the queued answers replay to
// their real endpoints, which re-grade authoritatively.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lang = dbUser.learningLang
  await connectDB()

  const [mistakes, dueGrammar] = await Promise.all([
    getDueMistakes(dbUser._id, lang, 50),
    getDueGrammarQuestions(dbUser._id, lang, dbUser.cefrLevel),
  ])

  // getDueGrammarQuestions hides the answer; pull answerIndex + explanation for
  // the due ids so the MCQ can be graded on-device.
  const ansById = new Map<string, { answerIndex: number; explanation: string }>()
  if (dueGrammar.length) {
    const rows = await GrammarQuestion.find({ _id: { $in: dueGrammar.map((q) => q.id) } })
      .select('answerIndex explanation')
      .lean()
    for (const r of rows) ansById.set(String(r._id), { answerIndex: r.answerIndex, explanation: r.explanation })
  }

  return NextResponse.json({
    learningLang: lang,
    nativeLang: dbUser.nativeLang,
    cefrLevel: dbUser.cefrLevel ?? null,
    savedAt: Date.now(),
    mistakes: mistakes.map((m) => ({
      id: String(m._id),
      source: m.source,
      prompt: m.prompt,
      answer: m.answer,
      userAnswer: m.userAnswer ?? '',
      note: m.note ?? '',
      box: m.box,
    })),
    grammarQuestions: dueGrammar.map((q) => ({
      ...q,
      answerIndex: ansById.get(q.id)?.answerIndex ?? 0,
      explanation: ansById.get(q.id)?.explanation ?? '',
    })),
  })
}
