import { defineModel, type Document, type Model } from '@/lib/db/model'
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

const GrammarLesson: Model<IGrammarLesson> = defineModel<IGrammarLesson>({
  collection: 'grammarLessons',
  cacheMs: 60 * 60 * 1000, // static content: cached in memory for an hour, only affected entries dropped on a write
  key: ['slug'],
  indexed: ['languageCode'],
  defaults: () => ({ topic: '', order: 0, summary: '', explanation: '', examples: [], drills: [], isSystem: true, generatedAt: new Date() }),
})
export default GrammarLesson
