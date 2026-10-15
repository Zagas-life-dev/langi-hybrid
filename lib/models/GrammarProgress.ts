import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// Tracks a learner's completion of a grammar mini-lesson's drill set. One doc
// per (learner, lesson). `bestScore` is the highest drill accuracy (0–100).
export interface IGrammarProgress extends Document {
  userId: Types.ObjectId
  lessonSlug: string
  languageCode: string
  completed: boolean
  bestScore: number
  attempts: number
  lastAttemptAt: Date
  createdAt: Date
  updatedAt: Date
}

const GrammarProgressSchema = new Schema<IGrammarProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    lessonSlug: { type: String, required: true },
    languageCode: { type: String, required: true },
    completed: { type: Boolean, default: false },
    bestScore: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

GrammarProgressSchema.index({ userId: 1, lessonSlug: 1 }, { unique: true })

if (mongoose.models.GrammarProgress) mongoose.deleteModel('GrammarProgress')
const GrammarProgress: Model<IGrammarProgress> =
  mongoose.model<IGrammarProgress>('GrammarProgress', GrammarProgressSchema)
export default GrammarProgress
