import mongoose, { Schema, Document, Model } from 'mongoose'
import type { CefrLevel } from './LangiUser'

export interface GrammarExample { fr: string; en: string }
export interface GrammarDrill { prompt: string; answer: string; hint?: string }

// An AI-generated, level-gated grammar mini-lesson, cached by slug so it's
// produced once and then served from the DB. The catalog (topics/order/level)
// lives in lib/grammar.ts; this stores the generated body + drills.
export interface IGrammarLesson extends Document {
  languageCode: string
  slug: string
  level: CefrLevel
  title: string
  topic: string
  order: number
  summary: string
  explanation: string         // plain text, paragraphs separated by \n
  examples: GrammarExample[]
  drills: GrammarDrill[]
  isSystem: boolean
  generatedAt: Date
}

const GrammarLessonSchema = new Schema<IGrammarLesson>({
  languageCode: { type: String, required: true, index: true },
  slug: { type: String, required: true, unique: true, index: true },
  level: { type: String, required: true },
  title: { type: String, required: true },
  topic: { type: String, default: '' },
  order: { type: Number, default: 0 },
  summary: { type: String, default: '' },
  explanation: { type: String, default: '' },
  examples: { type: [new Schema<GrammarExample>({ fr: String, en: String }, { _id: false })], default: [] },
  drills: {
    type: [new Schema<GrammarDrill>({ prompt: String, answer: String, hint: String }, { _id: false })],
    default: [],
  },
  isSystem: { type: Boolean, default: true },
  generatedAt: { type: Date, default: Date.now },
})

if (mongoose.models.GrammarLesson) mongoose.deleteModel('GrammarLesson')
const GrammarLesson: Model<IGrammarLesson> = mongoose.model<IGrammarLesson>('GrammarLesson', GrammarLessonSchema)
export default GrammarLesson
