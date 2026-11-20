import { defineModel, type Document, type Model } from '@/lib/db/model'

// Per-user fixed-window counters guarding the AI-calling routes.
export interface IRateLimit extends Document {
  userId: string
  bucket: string        // e.g. 'ai:minute' | 'ai:day'
  windowStart: number   // epoch ms of the current window's start
  count: number
}

const RateLimit: Model<IRateLimit> = defineModel<IRateLimit>({
  collection: 'rateLimits',
  key: ['userId', 'bucket'],
  defaults: () => ({ count: 0 }),
})
export default RateLimit
