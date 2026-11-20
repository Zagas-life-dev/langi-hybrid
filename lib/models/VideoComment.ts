import { defineModel, type Document, type Model } from '@/lib/db/model'

// A Langi-native comment on a video. `displayName` is snapshotted at post time
// so the thread renders without a join even if the user later changes their name.
export interface IVideoComment extends Document {
  videoId: string
  languageCode: string
  userId: string
  displayName: string
  text: string
  createdAt: Date
}

const VideoComment: Model<IVideoComment> = defineModel<IVideoComment>({
  collection: 'videoComments',
  indexed: ['videoId', 'userId'],
  defaults: () => ({ displayName: 'Learner', createdAt: new Date() }),
})
export default VideoComment
