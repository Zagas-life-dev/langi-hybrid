import { defineModel, type Document, type Model } from '@/lib/db/model'

// The Leitner state for one (user, card) pair. Cards with no UserCard yet are
// "new" and surfaced into the review queue up to a per-session cap.
export interface IUserCard extends Document {
  userId: string
  cardId: string
  languageCode: string
  box: number               // 1..5
  dueAt: Date
  lastReviewedAt?: Date
  correctStreak: number
  lapses: number
  reps: number
}

const UserCard: Model<IUserCard> = defineModel<IUserCard>({
  collection: 'userCards',
  key: ['userId', 'cardId'],
  indexed: ['userId', 'languageCode'],
  plain: ['box'],
  defaults: () => ({ box: 1, dueAt: new Date(), correctStreak: 0, lapses: 0, reps: 0 }),
})
export default UserCard
