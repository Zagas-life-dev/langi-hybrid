import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

// A grammar concept multiple-choice question (the bank). Seeded from
// data/french/grammar-questions.json. `concept` is the GRAMMAR_CATALOG slug the
// question tests, so practice can be gated to a learner's covered concepts.
export interface IGrammarQuestion extends Document {
  languageCode: string
  level: CefrLevel
  concept: string
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
  placement: boolean
}

const GrammarQuestion: Model<IGrammarQuestion> = defineModel<IGrammarQuestion>({
  collection: 'grammarQuestions',
  key: ['languageCode', 'prompt'],
  indexed: ['languageCode', 'level', 'concept'],
  defaults: () => ({ concept: '', explanation: '', placement: false }),
})
export default GrammarQuestion
