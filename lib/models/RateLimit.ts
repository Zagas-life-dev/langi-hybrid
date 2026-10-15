import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// Per-user fixed-window counters guarding the AI-calling routes.
export interface IRateLimit extends Document {
  userId: Types.ObjectId
  bucket: string        // e.g. 'ai:minute' | 'ai:day'
  windowStart: number   // epoch ms of the current window's start
  count: number
}

const RateLimitSchema = new Schema<IRateLimit>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true },
  bucket: { type: String, required: true },
  windowStart: { type: Number, required: true },
  count: { type: Number, default: 0 },
})

RateLimitSchema.index({ userId: 1, bucket: 1 }, { unique: true })

if (mongoose.models.RateLimit) mongoose.deleteModel('RateLimit')
const RateLimit: Model<IRateLimit> = mongoose.model<IRateLimit>('RateLimit', RateLimitSchema)
export default RateLimit
