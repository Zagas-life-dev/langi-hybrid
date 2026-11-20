import { defineModel, type Document, type Model } from '@/lib/db/model'

export interface IReviewLog extends Document {
  userId: string
  cardId: string
  result: 'correct' | 'incorrect'
  boxBefore: number
  boxAfter: number
  at: Date
}

const ReviewLog: Model<IReviewLog> = defineModel<IReviewLog>({
  collection: 'reviewLogs',
  indexed: ['userId'],
  defaults: () => ({ at: new Date() }),
})
export default ReviewLog
