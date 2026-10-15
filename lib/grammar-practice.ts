import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import GrammarQuestion from '@/lib/models/GrammarQuestion'
import GrammarQuestionState from '@/lib/models/GrammarQuestionState'
import { CEFR_LEVELS, type CefrLevel } from '@/lib/models/LangiUser'
import { NEW_PER_SESSION } from '@/lib/srs-core'

// "Covered" concepts = everything at or below the learner's current level
// (the grammar they're expected to have met). Unplaced learners get A1.
export function allowedLevels(cefr?: CefrLevel | null): CefrLevel[] {
  const idx = cefr ? CEFR_LEVELS.indexOf(cefr) : 0
  return CEFR_LEVELS.slice(0, Math.max(0, idx) + 1)
}

export interface DueGrammarQuestion {
  id: string
  level: string
  concept: string
  prompt: string
  options: string[]
  box: number
  isNew: boolean
}

/** Due grammar questions (SRS) at/below the learner's level, plus a capped
 * number of new ones. Answers are NOT included — the answer route reveals them. */
export async function getDueGrammarQuestions(
  userId: Types.ObjectId | string,
  lang: string,
  cefr?: CefrLevel | null
): Promise<DueGrammarQuestion[]> {
  await connectDB()
  const levels = allowedLevels(cefr)
  const questions = await GrammarQuestion.find({ languageCode: lang, level: { $in: levels } }).lean()
  const states = await GrammarQuestionState.find({
    userId,
    questionId: { $in: questions.map((q) => q._id) },
  }).lean()
  const stateByQ = new Map(states.map((s) => [String(s.questionId), s]))

  const now = new Date()
  const due: { q: (typeof questions)[number]; box: number; dueAt: Date }[] = []
  const fresh: (typeof questions)[number][] = []
  for (const q of questions) {
    const st = stateByQ.get(String(q._id))
    if (!st) fresh.push(q)
    else if (new Date(st.dueAt) <= now) due.push({ q, box: st.box, dueAt: new Date(st.dueAt) })
  }
  due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())

  const items: DueGrammarQuestion[] = [
    ...due.map(({ q, box }) => ({ q, box, isNew: false })),
    ...fresh.slice(0, NEW_PER_SESSION).map((q) => ({ q, box: 1, isNew: true })),
  ].map(({ q, box, isNew }) => ({
    id: String(q._id),
    level: q.level,
    concept: q.concept,
    prompt: q.prompt,
    options: q.options,
    box,
    isNew,
  }))
  return items
}

/** Count of grammar questions ready to practise (due + capped new). */
export async function countDueGrammarQuestions(
  userId: Types.ObjectId | string,
  lang: string,
  cefr?: CefrLevel | null
): Promise<number> {
  await connectDB()
  const levels = allowedLevels(cefr)
  const ids = (await GrammarQuestion.find({ languageCode: lang, level: { $in: levels } }).select('_id').lean()).map((q) => q._id)
  if (ids.length === 0) return 0
  const states = await GrammarQuestionState.find({ userId, questionId: { $in: ids } }).select('dueAt').lean()
  const now = new Date()
  const dueNow = states.filter((s) => new Date(s.dueAt) <= now).length
  const newCount = Math.min(Math.max(0, ids.length - states.length), NEW_PER_SESSION)
  return dueNow + newCount
}
