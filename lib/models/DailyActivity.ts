import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// One doc per (learner, calendar day) — the source of truth for the daily-goal
// ring and the activity heatmap. `date` is a local 'YYYY-MM-DD' string so a
// day is whatever the learner's own clock says, independent of server TZ.
export interface IDailyActivity extends Document {
  userId: Types.ObjectId
  date: string            // 'YYYY-MM-DD' in the learner's local time
  reviews: number         // card reviews (what the daily goal ring measures)
  correct: number
  sentences: number
  chats: number
  videos: number
  grammarDrills: number
  mistakes: number        // mistakes-deck reviews
  xp: number
  goalMet: boolean
  createdAt: Date
  updatedAt: Date
}

const DailyActivitySchema = new Schema<IDailyActivity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    date: { type: String, required: true },
    reviews: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    sentences: { type: Number, default: 0 },
    chats: { type: Number, default: 0 },
    videos: { type: Number, default: 0 },
    grammarDrills: { type: Number, default: 0 },
    mistakes: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    goalMet: { type: Boolean, default: false },
  },
  { timestamps: true }
)

DailyActivitySchema.index({ userId: 1, date: 1 }, { unique: true })

if (mongoose.models.DailyActivity) mongoose.deleteModel('DailyActivity')
const DailyActivity: Model<IDailyActivity> = mongoose.model<IDailyActivity>('DailyActivity', DailyActivitySchema)
export default DailyActivity
