import { defineModel, type Document, type Model } from '@/lib/db/model'

export interface IVideoItem {
  videoId: string
  title: string
  channelTitle: string
  description: string
  thumbnail: string
  publishedAt?: string
  // ISO-8601 duration (e.g. "PT58S"), only populated for the Shorts feed.
  duration?: string
}

export type VideoCategory = 'casual' | 'lessons' | 'classes' | 'creators' | 'shorts'

export interface IVideoCache extends Document {
  languageCode: string
  category: VideoCategory
  items: IVideoItem[]
  fetchedAt: Date
  // YouTube pagination cursor for the next page (Shorts infinite scroll).
  nextPageToken?: string
}

const VideoCache: Model<IVideoCache> = defineModel<IVideoCache>({
  collection: 'videoCaches',
  key: ['languageCode', 'category'],
  defaults: () => ({ items: [], fetchedAt: new Date() }),
})
export default VideoCache
