import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// The Leitner state for one (user, card) pair. Cards with no UserCard yet are
// "new" and surfaced into the review queue up to a per-session cap.
export interface IUserCard extends Document {
  userId: Types.ObjectId
  cardId: Types.ObjectId
  languageCode: string
  box: number               // 1..5
  dueAt: Date
  lastReviewedAt?: Date
  correctStreak: number
  lapses: number
  reps: number
}

const UserCardSchema = new Schema<IUserCard>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  cardId: { type: Schema.Types.ObjectId, ref: 'Card', required: true, index: true },
  languageCode: { type: String, required: true, index: true },
  box: { type: Number, default: 1 },
  dueAt: { type: Date, default: Date.now, index: true },
  lastReviewedAt: { type: Date },
  correctStreak: { type: Number, default: 0 },
  lapses: { type: Number, default: 0 },
  reps: { type: Number, default: 0 },
})

UserCardSchema.index({ userId: 1, cardId: 1 }, { unique: true })

if (mongoose.models.UserCard) mongoose.deleteModel('UserCard')
const UserCard: Model<IUserCard> = mongoose.model<IUserCard>('UserCard', UserCardSchema)
export default UserCard
