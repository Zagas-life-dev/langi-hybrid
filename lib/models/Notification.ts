import mongoose, { Schema, Document, Model, Types } from 'mongoose'

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
  userId: Types.ObjectId
  type: LangiNotificationType
  title: string
  body: string
  // Optional in-app deep link (e.g. /learn/mistakes).
  url: string | null
  read: boolean
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    type: {
      type: String,
      enum: ['study_reminder', 'streak_warning', 'goal_met', 'achievement', 'mistakes_due', 'level_up', 'weekly_digest', 'friend'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    url: { type: String, default: null },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
)

// Common query: a learner's recent notifications, newest first.
NotificationSchema.index({ userId: 1, createdAt: -1 })

if (mongoose.models.Notification) mongoose.deleteModel('Notification')
const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  NotificationSchema
)
export default Notification
