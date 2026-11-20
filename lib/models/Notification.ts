import { defineModel, type Document, type Model } from '@/lib/db/model'

export type LangiNotificationType =
  | 'study_reminder'   // cards are due — come back and study
  | 'streak_warning'   // your streak is about to break
  | 'goal_met'         // you hit today's daily goal
  | 'achievement'      // you unlocked an achievement
  | 'mistakes_due'     // your mistakes deck has items waiting
  | 'level_up'         // you passed a level-up test
  | 'weekly_digest'    // your week in review
  | 'friend'           // someone added you as a friend

export interface INotification extends Document {
  // Recipient's LangiUser _id.
  userId: string
  type: LangiNotificationType
  title: string
  body: string
  // Optional in-app deep link (e.g. /learn/mistakes).
  url: string | null
  read: boolean
  createdAt: Date
  updatedAt: Date
}

const Notification: Model<INotification> = defineModel<INotification>({
  collection: 'notifications',
  timestamps: true,
  indexed: ['userId', 'read'],
  defaults: () => ({ body: '', url: null, read: false }),
})
export default Notification
