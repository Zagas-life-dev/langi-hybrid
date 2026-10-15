import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDueMistakes } from '@/lib/mistakes'

// The Mistakes-deck queue. The `answer` IS sent (this is a self-graded recall
// deck — the learner reveals the correction themselves), so no answer-hiding.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const lang = dbUser.learningLang
  const due = await getDueMistakes(dbUser._id, lang)

  return NextResponse.json({
    count: due.length,
    items: due.map((m) => ({
      id: String(m._id),
      source: m.source,
      prompt: m.prompt,
      answer: m.answer,
      userAnswer: m.userAnswer,
      note: m.note,
      box: m.box,
    })),
  })
}
