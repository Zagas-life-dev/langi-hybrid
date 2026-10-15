import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import GrammarQuestion from '@/lib/models/GrammarQuestion'
import Deck from '@/lib/models/Deck'
import Card from '@/lib/models/Card'
import type { CefrLevel } from '@/lib/models/LangiUser'
import { scoreLevelUp, type Section, type LevelUpVerdict } from '@/lib/levelUpCore'

export * from '@/lib/levelUpCore'

// Level-up test: a short exam on the NEXT CEFR level, built entirely from
// content we already have — the grammar question bank plus multiple-choice
// vocab drawn from that level's curated decks (distractors are other cards'
// meanings at the same level). No AI, so it's free and always available.

const PER_SECTION = 8

export interface LevelUpQuestion {
  id: string          // 'g:<grammarQuestionId>' | 'v:<cardId>'
  section: Section
  prompt: string
  options: string[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function buildLevelUpForm(lang: string, level: CefrLevel): Promise<LevelUpQuestion[]> {
  await connectDB()
  const grammar = shuffle(await GrammarQuestion.find({ languageCode: lang, level }).lean()).slice(0, PER_SECTION)

  const decks = await Deck.find({ languageCode: lang, level, isSystem: true }).select('_id').lean()
  const cards = await Card.find({ deckId: { $in: decks.map((d) => d._id) } }).select('term translation').lean()
  const vocab = shuffle(cards).slice(0, PER_SECTION)

  const vocabQs: LevelUpQuestion[] = vocab.map((c) => {
    const wrong = shuffle(cards.filter((o) => o.translation !== c.translation))
      .map((o) => o.translation)
      .filter((t, i, all) => all.indexOf(t) === i)
      .slice(0, 3)
    return {
      id: `v:${String(c._id)}`,
      section: 'vocab',
      prompt: `What does « ${c.term} » mean?`,
      options: shuffle([c.translation, ...wrong]),
    }
  })
  const grammarQs: LevelUpQuestion[] = grammar.map((q) => ({
    id: `g:${String(q._id)}`,
    section: 'grammar',
    prompt: q.prompt,
    options: q.options,
  }))
  // Alternate sections so the test doesn't feel like two blocks.
  const out: LevelUpQuestion[] = []
  for (let i = 0; i < Math.max(grammarQs.length, vocabQs.length); i++) {
    if (grammarQs[i]) out.push(grammarQs[i])
    if (vocabQs[i]) out.push(vocabQs[i])
  }
  return out
}

/** Check submitted answers (option TEXT, so shuffled vocab options still grade). */
export async function gradeLevelUp(
  lang: string,
  level: CefrLevel,
  answers: { id: string; answer: string }[]
): Promise<LevelUpVerdict> {
  await connectDB()
  const gIds = answers.filter((a) => a.id.startsWith('g:')).map((a) => a.id.slice(2)).filter(Types.ObjectId.isValid)
  const vIds = answers.filter((a) => a.id.startsWith('v:')).map((a) => a.id.slice(2)).filter(Types.ObjectId.isValid)
  const [gqs, cards] = await Promise.all([
    GrammarQuestion.find({ _id: { $in: gIds }, languageCode: lang, level }).lean(),
    Card.find({ _id: { $in: vIds }, languageCode: lang }).select('translation').lean(),
  ])
  const gById = new Map(gqs.map((q) => [String(q._id), q]))
  const cById = new Map(cards.map((c) => [String(c._id), c]))

  const results: { section: Section; correct: boolean }[] = []
  for (const a of answers) {
    const key = a.id.slice(2)
    if (a.id.startsWith('g:')) {
      const q = gById.get(key)
      if (q) results.push({ section: 'grammar', correct: q.options[q.answerIndex] === a.answer })
    } else if (a.id.startsWith('v:')) {
      const c = cById.get(key)
      if (c) results.push({ section: 'vocab', correct: c.translation === a.answer })
    }
  }
  return scoreLevelUp(results)
}
