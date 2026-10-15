import mongoose, { Schema, Document, Model } from 'mongoose'
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

const DeckSchema = new Schema<IDeck>({
  slug: { type: String, required: true, unique: true, index: true },
  languageCode: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  level: { type: String, required: true },
  topic: { type: String, default: '' },
  order: { type: Number, default: 0 },
  isSystem: { type: Boolean, default: true },
  answerTolerance: { type: String, enum: ['lenient', 'strict'], default: 'lenient' },
})

if (mongoose.models.Deck) mongoose.deleteModel('Deck')
const Deck: Model<IDeck> = mongoose.model<IDeck>('Deck', DeckSchema)
export default Deck
