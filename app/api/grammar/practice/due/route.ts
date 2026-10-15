import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getDueGrammarQuestions } from '@/lib/grammar-practice'

// Grammar-concept practice queue — MCQs at/below the learner's level, SRS-ordered.
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const items = await getDueGrammarQuestions(dbUser._id, dbUser.learningLang, dbUser.cefrLevel)
  return NextResponse.json({ count: items.length, items })
}
