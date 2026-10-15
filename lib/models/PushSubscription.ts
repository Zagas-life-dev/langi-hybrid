import mongoose, { Schema, Document, Model } from 'mongoose'

// A browser Web Push subscription, one per device/browser a learner opts in from.
// `userId` is the LangiUser _id (string) — the key every Langi collection uses.
export interface IPushSubscription extends Document {
  userId: string
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent: string | null
  // Captured at subscribe time so the reminder cron can fire at the learner's
  // local clock hour without a server-side timezone database.
  tzOffsetMinutes: number
  createdAt: Date
  updatedAt: Date
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: String, required: true, index: true },
    // The push endpoint uniquely identifies a subscription across users.
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: null },
    tzOffsetMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
)

if (mongoose.models.PushSubscription) mongoose.deleteModel('PushSubscription')
const PushSubscription: Model<IPushSubscription> = mongoose.model<IPushSubscription>(
  'PushSubscription',
  PushSubscriptionSchema
)
export default PushSubscription
