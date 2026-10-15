import mongoose, { Schema, Document, Model } from 'mongoose'
import type { CefrLevel } from './LangiUser'

export interface IPlacementQuestion extends Document {
  languageCode: string
  level: CefrLevel
  kind: 'vocab' | 'grammar' | 'reading'
  prompt: string
  options: string[]
  answerIndex: number
}

const PlacementQuestionSchema = new Schema<IPlacementQuestion>({
  languageCode: { type: String, required: true, index: true },
  level: { type: String, required: true, index: true },
  kind: { type: String, enum: ['vocab', 'grammar', 'reading'], default: 'vocab' },
  prompt: { type: String, required: true },
  options: { type: [String], required: true },
  answerIndex: { type: Number, required: true },
})

// Stable key for idempotent seeding.
PlacementQuestionSchema.index({ languageCode: 1, prompt: 1 }, { unique: true })

if (mongoose.models.PlacementQuestion) mongoose.deleteModel('PlacementQuestion')
const PlacementQuestion: Model<IPlacementQuestion> =
  mongoose.model<IPlacementQuestion>('PlacementQuestion', PlacementQuestionSchema)
export default PlacementQuestion
