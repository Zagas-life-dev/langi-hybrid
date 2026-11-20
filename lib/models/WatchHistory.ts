import { defineModel, type Document, type Model } from '@/lib/db/model'

// One row per (user, video) the user has watched. Upserting refreshes
// `watchedAt`. Drives repetition control (exclude from recs/shorts), the
// "Continue watching" row (with resume points), and first-watch streak/XP.
export interface IWatchHistory extends Document {
  userId: string
  videoId: string
  languageCode: string
  playlistId?: string
  watchedAt: Date
  // Engagement signals — finishing a video is a strong "more like this" signal.
  completed: boolean      // ever watched to the end (or ≥95%)
  completions: number     // times finished
  // Resume point: where the learner left off (seconds) and the video's length.
  // Reset to 0 once they reach the end, so a rewatch starts from the top.
  position: number
  duration: number
}

const WatchHistory: Model<IWatchHistory> = defineModel<IWatchHistory>({
  collection: 'watchHistory',
  key: ['userId', 'videoId'],
  indexed: ['userId', 'videoId'],
  defaults: () => ({ watchedAt: new Date(), completed: false, completions: 0, position: 0, duration: 0 }),
})
export default WatchHistory
