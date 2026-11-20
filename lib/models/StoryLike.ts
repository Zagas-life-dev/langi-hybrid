import { defineModel, type Document, type Model } from '@/lib/db/model'

// One row per (user, story) liked. A like is a toggle: the row exists while liked
// and is deleted on un-like. The unique index keeps the toggle race-safe; the
// running count is denormalized onto Story.likeCount for cheap feed ranking.
export interface IStoryLike extends Document {
  storyId: string
  userId: string
  createdAt: Date
}

const StoryLike: Model<IStoryLike> = defineModel<IStoryLike>({
  collection: 'storyLikes',
  key: ['storyId', 'userId'],
  indexed: ['storyId', 'userId'],
  defaults: () => ({ createdAt: new Date() }),
})
export default StoryLike
