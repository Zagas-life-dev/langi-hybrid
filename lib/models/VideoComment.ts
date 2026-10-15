import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// A Langi-native comment on a video. `displayName` is snapshotted at post time
// so the thread renders without a join even if the user later changes their name.
export interface IVideoComment extends Document {
  videoId: string
  languageCode: string
  userId: Types.ObjectId
  displayName: string
  text: string
  createdAt: Date
}

const VideoCommentSchema = new Schema<IVideoComment>({
  videoId: { type: String, required: true },
  languageCode: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  displayName: { type: String, default: 'Learner' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

// Newest-first listing per video.
VideoCommentSchema.index({ videoId: 1, createdAt: -1 })

if (mongoose.models.VideoComment) mongoose.deleteModel('VideoComment')
const VideoComment: Model<IVideoComment> = mongoose.model<IVideoComment>('VideoComment', VideoCommentSchema)
export default VideoComment
