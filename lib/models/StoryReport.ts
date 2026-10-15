import mongoose, { Schema, Document, Model, Types } from 'mongoose'

// A user's report of a published story. Unique per (user, story) so one person
// can't inflate the count. When Story.reportCount crosses REPORT_HIDE_THRESHOLD
// the story is auto-hidden from the community feed pending review (report-only
// moderation).
export interface IStoryReport extends Document {
  storyId: Types.ObjectId
  userId: Types.ObjectId
  reason: string
  createdAt: Date
}

export const REPORT_HIDE_THRESHOLD = 3

const StoryReportSchema = new Schema<IStoryReport>({
  storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
})

StoryReportSchema.index({ storyId: 1, userId: 1 }, { unique: true })

if (mongoose.models.StoryReport) mongoose.deleteModel('StoryReport')
const StoryReport: Model<IStoryReport> = mongoose.model<IStoryReport>('StoryReport', StoryReportSchema)
export default StoryReport
