import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// Bookmark: one row per (user, story) the learner saved to read later. Toggled
// like a like; unique index keeps it idempotent. Story.saveCount is denormalized.
export interface IStorySave extends Document {
  storyId: Types.ObjectId
  userId: Types.ObjectId
  createdAt: Date
}

const StorySaveSchema = new Schema<IStorySave>({
  storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  createdAt: { type: Date, default: Date.now },
})

StorySaveSchema.index({ storyId: 1, userId: 1 }, { unique: true })

if (mongoose.models.StorySave) mongoose.deleteModel('StorySave')
const StorySave: Model<IStorySave> = mongoose.model<IStorySave>('StorySave', StorySaveSchema)
export default StorySave
