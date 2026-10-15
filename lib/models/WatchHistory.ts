import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// One row per (user, video) the user has watched. Upserting refreshes
// `watchedAt`. Drives repetition control (exclude from recs/shorts), the
// "Continue watching" row (with resume points), and first-watch streak/XP.
export interface IWatchHistory extends Document {
  userId: Types.ObjectId
  videoId: string
  languageCode: string
  playlistId?: Types.ObjectId
  watchedAt: Date
  // Engagement signals — finishing a video is a strong "more like this" signal.
  completed: boolean      // ever watched to the end (or ≥95%)
  completions: number     // times finished
  // Resume point: where the learner left off (seconds) and the video's length.
  // Reset to 0 once they reach the end, so a rewatch starts from the top.
  position: number
  duration: number
}

const WatchHistorySchema = new Schema<IWatchHistory>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  videoId: { type: String, required: true },
  languageCode: { type: String, required: true, index: true },
  playlistId: { type: Schema.Types.ObjectId, ref: 'Playlist' },
  watchedAt: { type: Date, default: Date.now },
  completed: { type: Boolean, default: false },
  completions: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
})

WatchHistorySchema.index({ userId: 1, videoId: 1 }, { unique: true })
WatchHistorySchema.index({ userId: 1, watchedAt: -1 })
// Co-watch recommendations look up who finished a given video.
WatchHistorySchema.index({ videoId: 1, completed: 1 })

if (mongoose.models.WatchHistory) mongoose.deleteModel('WatchHistory')
const WatchHistory: Model<IWatchHistory> = mongoose.model<IWatchHistory>('WatchHistory', WatchHistorySchema)
export default WatchHistory
