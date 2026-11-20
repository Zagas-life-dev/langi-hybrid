import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

export interface IPlacementResult extends Document {
  userId: string
  languageCode: string
  level: CefrLevel
  // Per-skill ceiling, e.g. { grammar: 'A2', vocab: 'B1' }.
  levelBySkill: Record<string, CefrLevel>
  scoreByLevel: Record<string, { correct: number; total: number }>
  at: Date
}

const PlacementResult: Model<IPlacementResult> = defineModel<IPlacementResult>({
  collection: 'placementResults',
  indexed: ['userId'],
  defaults: () => ({ levelBySkill: {}, scoreByLevel: {}, at: new Date() }),
})
export default PlacementResult
