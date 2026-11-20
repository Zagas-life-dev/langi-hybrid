import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

export type AnswerTolerance = 'lenient' | 'strict'

export interface IDeck extends Document {
  slug: string          // stable key for idempotent seeding, e.g. 'fr-a1-greetings'
  languageCode: string
  title: string
  description: string
  level: CefrLevel
  topic: string
  order: number
  isSystem: boolean
  // 'lenient' ignores accents + a leading article; 'strict' keeps them (gender matters).
  answerTolerance: AnswerTolerance
}

const Deck: Model<IDeck> = defineModel<IDeck>({
  collection: 'decks',
  cacheMs: 60 * 60 * 1000, // static content: cached in memory for an hour, only affected entries dropped on a write
  key: ['slug'],
  indexed: ['languageCode'],
  defaults: () => ({ description: '', topic: '', order: 0, isSystem: true, answerTolerance: 'lenient' }),
})
export default Deck
