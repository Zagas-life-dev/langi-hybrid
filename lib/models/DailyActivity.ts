import { defineModel, type Document, type Model } from '@/lib/db/model'

// One doc per (learner, calendar day) — the source of truth for the daily-goal
// ring and the activity heatmap. `date` is a local 'YYYY-MM-DD' string so a
// day is whatever the learner's own clock says, independent of server TZ.
export interface IDailyActivity extends Document {
  userId: string
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

const DailyActivity: Model<IDailyActivity> = defineModel<IDailyActivity>({
  collection: 'dailyActivities',
  timestamps: true,
  key: ['userId', 'date'],
  indexed: ['userId'],
  defaults: () => ({ reviews: 0, correct: 0, sentences: 0, chats: 0, videos: 0, grammarDrills: 0, mistakes: 0, xp: 0, goalMet: false }),
})
export default DailyActivity
