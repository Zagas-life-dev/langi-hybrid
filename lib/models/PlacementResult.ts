import mongoose, { Schema, Document, Model, Types } from 'mongoose'
import type { CefrLevel } from './LangiUser'

export interface IPlacementResult extends Document {
  userId: Types.ObjectId
  languageCode: string
  level: CefrLevel
  // Per-skill ceiling, e.g. { grammar: 'A2', vocab: 'B1' }.
  levelBySkill: Record<string, CefrLevel>
  scoreByLevel: Record<string, { correct: number; total: number }>
  at: Date
}

const PlacementResultSchema = new Schema<IPlacementResult>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  languageCode: { type: String, required: true },
  level: { type: String, required: true },
  levelBySkill: { type: Schema.Types.Mixed, default: {} },
  scoreByLevel: { type: Schema.Types.Mixed, default: {} },
  at: { type: Date, default: Date.now },
})

if (mongoose.models.PlacementResult) mongoose.deleteModel('PlacementResult')
const PlacementResult: Model<IPlacementResult> =
  mongoose.model<IPlacementResult>('PlacementResult', PlacementResultSchema)
export default PlacementResult
