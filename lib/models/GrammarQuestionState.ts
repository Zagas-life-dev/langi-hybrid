import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// Per-(learner, grammar question) Leitner SRS state — mirrors UserCard, so
// grammar concept questions are spaced and reviewed just like vocab. Questions
// with no state yet are "new" and introduced into practice up to a session cap.
export interface IGrammarQuestionState extends Document {
  userId: Types.ObjectId
  questionId: Types.ObjectId
  languageCode: string
  box: number
  dueAt: Date
  lastReviewedAt?: Date
  correctStreak: number
  lapses: number
  reps: number
}

const GrammarQuestionStateSchema = new Schema<IGrammarQuestionState>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  questionId: { type: Schema.Types.ObjectId, ref: 'GrammarQuestion', required: true, index: true },
  languageCode: { type: String, required: true, index: true },
  box: { type: Number, default: 1 },
  dueAt: { type: Date, default: Date.now, index: true },
  lastReviewedAt: { type: Date },
  correctStreak: { type: Number, default: 0 },
  lapses: { type: Number, default: 0 },
  reps: { type: Number, default: 0 },
})

GrammarQuestionStateSchema.index({ userId: 1, questionId: 1 }, { unique: true })

if (mongoose.models.GrammarQuestionState) mongoose.deleteModel('GrammarQuestionState')
const GrammarQuestionState: Model<IGrammarQuestionState> =
  mongoose.model<IGrammarQuestionState>('GrammarQuestionState', GrammarQuestionStateSchema)
export default GrammarQuestionState
