import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface ISentenceAttempt extends Document {
  userId: Types.ObjectId
  languageCode: string
  prompt: string          // the English sentence to translate
  userSentence: string
  correction: string
  feedback: string
  score: number
  at: Date
}

const SentenceAttemptSchema = new Schema<ISentenceAttempt>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  languageCode: { type: String, required: true },
  prompt: { type: String, required: true },
  userSentence: { type: String, required: true },
  correction: { type: String, default: '' },
  feedback: { type: String, default: '' },
  score: { type: Number, default: 0 },
  at: { type: Date, default: Date.now, index: true },
})

if (mongoose.models.SentenceAttempt) mongoose.deleteModel('SentenceAttempt')
const SentenceAttempt: Model<ISentenceAttempt> =
  mongoose.model<ISentenceAttempt>('SentenceAttempt', SentenceAttemptSchema)
export default SentenceAttempt
