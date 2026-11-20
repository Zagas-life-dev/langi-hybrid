import { defineModel, type Document, type Model } from '@/lib/db/model'

// A user's report of a published story. Unique per (user, story) so one person
// can't inflate the count. When Story.reportCount crosses REPORT_HIDE_THRESHOLD
// the story is auto-hidden from the community feed pending review (report-only
// moderation).
export interface IStoryReport extends Document {
  storyId: string
  userId: string
  reason: string
  createdAt: Date
}

export const REPORT_HIDE_THRESHOLD = 3

const StoryReport: Model<IStoryReport> = defineModel<IStoryReport>({
  collection: 'storyReports',
  key: ['storyId', 'userId'],
  indexed: ['storyId'],
  defaults: () => ({ reason: '', createdAt: new Date() }),
})
export default StoryReport
