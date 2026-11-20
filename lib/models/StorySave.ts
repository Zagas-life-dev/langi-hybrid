import { defineModel, type Document, type Model } from '@/lib/db/model'

// Bookmark: one row per (user, story) the learner saved to read later. Toggled
// like a like; unique index keeps it idempotent. Story.saveCount is denormalized.
export interface IStorySave extends Document {
  storyId: string
  userId: string
  createdAt: Date
}

const StorySave: Model<IStorySave> = defineModel<IStorySave>({
  collection: 'storySaves',
  key: ['storyId', 'userId'],
  indexed: ['storyId', 'userId'],
  defaults: () => ({ createdAt: new Date() }),
})
export default StorySave
