import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// One row per (user, story) liked. A like is a toggle: the row exists while liked
// and is deleted on un-like. The unique index keeps the toggle race-safe; the
// running count is denormalized onto Story.likeCount for cheap feed ranking.
export interface IStoryLike extends Document {
  storyId: Types.ObjectId
  userId: Types.ObjectId
  createdAt: Date
}

const StoryLikeSchema = new Schema<IStoryLike>({
  storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  createdAt: { type: Date, default: Date.now },
})

StoryLikeSchema.index({ storyId: 1, userId: 1 }, { unique: true })

if (mongoose.models.StoryLike) mongoose.deleteModel('StoryLike')
const StoryLike: Model<IStoryLike> = mongoose.model<IStoryLike>('StoryLike', StoryLikeSchema)
export default StoryLike
