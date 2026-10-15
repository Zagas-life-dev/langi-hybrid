import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export type MistakeSource = 'sentence' | 'chat' | 'review' | 'grammar'

// A personalised SRS item auto-generated from something the learner got wrong:
// a low-scoring sentence translation, a tutor correction in chat, or a missed
// grammar drill. Reviewed in the Mistakes deck (self-graded recall) and retired
// once it graduates to the top box.
export interface IMistake extends Document {
  userId: Types.ObjectId
  languageCode: string
  source: MistakeSource
  prompt: string        // front context, e.g. the English to translate / your sentence
  answer: string        // the correct target-language text to recall
  userAnswer: string    // what the learner originally wrote (shown on reveal)
  note: string          // short English explanation of the fix
  // Leitner SRS state (reuses lib/srs-core grade()).
  box: number
  dueAt: Date
  correctStreak: number
  lapses: number
  reps: number
  lastReviewedAt?: Date
  resolved: boolean     // graduated out of active review (box 5)
  createdAt: Date
  updatedAt: Date
}

const MistakeSchema = new Schema<IMistake>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    languageCode: { type: String, required: true, index: true },
    source: { type: String, enum: ['sentence', 'chat', 'review', 'grammar'], required: true },
    prompt: { type: String, required: true },
    answer: { type: String, required: true },
    userAnswer: { type: String, default: '' },
    note: { type: String, default: '' },
    box: { type: Number, default: 1 },
    dueAt: { type: Date, default: Date.now, index: true },
    correctStreak: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    reps: { type: Number, default: 0 },
    lastReviewedAt: { type: Date },
    resolved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
)

MistakeSchema.index({ userId: 1, resolved: 1, dueAt: 1 })

if (mongoose.models.Mistake) mongoose.deleteModel('Mistake')
const Mistake: Model<IMistake> = mongoose.model<IMistake>('Mistake', MistakeSchema)
export default Mistake
