import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

export interface IPlacementQuestion extends Document {
  languageCode: string
  level: CefrLevel
  kind: 'vocab' | 'grammar' | 'reading'
  prompt: string
  options: string[]
  answerIndex: number
}

const PlacementQuestion: Model<IPlacementQuestion> = defineModel<IPlacementQuestion>({
  collection: 'placementQuestions',
  key: ['languageCode', 'prompt'],
  indexed: ['languageCode', 'level'],
  defaults: () => ({ kind: 'vocab' }),
})
export default PlacementQuestion
