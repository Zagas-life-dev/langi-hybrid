import { defineModel, type Document, type Model } from '@/lib/db/model'

// One row per (user, video) they have liked. A like is a toggle: the row exists
// while liked and is deleted on un-like. The unique index makes the toggle and
// the count cheap and race-safe.
export interface IVideoLike extends Document {
  videoId: string
  userId: string
  languageCode: string
  createdAt: Date
}

const VideoLike: Model<IVideoLike> = defineModel<IVideoLike>({
  collection: 'videoLikes',
  key: ['videoId', 'userId'],
  indexed: ['videoId', 'userId'],
  defaults: () => ({ createdAt: new Date() }),
})
export default VideoLike
