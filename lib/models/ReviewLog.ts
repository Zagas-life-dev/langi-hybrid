import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IReviewLog extends Document {
  userId: Types.ObjectId
  cardId: Types.ObjectId
  result: 'correct' | 'incorrect'
  boxBefore: number
  boxAfter: number
  at: Date
}

const ReviewLogSchema = new Schema<IReviewLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
  result: { type: String, enum: ['correct', 'incorrect'], required: true },
  boxBefore: { type: Number, required: true },
  boxAfter: { type: Number, required: true },
  at: { type: Date, default: Date.now, index: true },
})

if (mongoose.models.ReviewLog) mongoose.deleteModel('ReviewLog')
const ReviewLog: Model<IReviewLog> = mongoose.model<IReviewLog>('ReviewLog', ReviewLogSchema)
export default ReviewLog
