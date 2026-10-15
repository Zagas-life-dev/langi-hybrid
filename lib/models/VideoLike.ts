import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// One row per (user, video) they have liked. A like is a toggle: the row exists
// while liked and is deleted on un-like. The unique index makes the toggle and
// the count cheap and race-safe.
export interface IVideoLike extends Document {
  videoId: string
  userId: Types.ObjectId
  languageCode: string
  createdAt: Date
}

const VideoLikeSchema = new Schema<IVideoLike>({
  videoId: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  languageCode: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

VideoLikeSchema.index({ videoId: 1, userId: 1 }, { unique: true })

if (mongoose.models.VideoLike) mongoose.deleteModel('VideoLike')
const VideoLike: Model<IVideoLike> = mongoose.model<IVideoLike>('VideoLike', VideoLikeSchema)
export default VideoLike
