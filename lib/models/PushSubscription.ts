import { defineModel, type Document, type Model } from '@/lib/db/model'

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

const PushSubscription: Model<IPushSubscription> = defineModel<IPushSubscription>({
  collection: 'pushSubscriptions',
  timestamps: true,
  key: ['endpoint'],
  indexed: ['userId'],
  defaults: () => ({ userAgent: null, tzOffsetMinutes: 0 }),
})
export default PushSubscription
