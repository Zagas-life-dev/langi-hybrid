import mongoose, { Schema, Document, Model } from 'mongoose'
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

const GrammarQuestionSchema = new Schema<IGrammarQuestion>({
  languageCode: { type: String, required: true, index: true },
  level: { type: String, required: true, index: true },
  concept: { type: String, default: '', index: true },
  prompt: { type: String, required: true },
  options: { type: [String], required: true },
  answerIndex: { type: Number, required: true },
  explanation: { type: String, default: '' },
  placement: { type: Boolean, default: false },
})

// Stable key for idempotent seeding.
GrammarQuestionSchema.index({ languageCode: 1, prompt: 1 }, { unique: true })

if (mongoose.models.GrammarQuestion) mongoose.deleteModel('GrammarQuestion')
const GrammarQuestion: Model<IGrammarQuestion> =
  mongoose.model<IGrammarQuestion>('GrammarQuestion', GrammarQuestionSchema)
export default GrammarQuestion
