import mongoose, { Schema, Document, Model } from 'mongoose'

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

const VideoItemSchema = new Schema<IVideoItem>(
  {
    videoId: { type: String, required: true },
    title: { type: String, required: true },
    channelTitle: { type: String, default: '' },
    description: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    publishedAt: { type: String },
    duration: { type: String },
  },
  { _id: false }
)

const VideoCacheSchema = new Schema<IVideoCache>({
  languageCode: { type: String, required: true },
  category: { type: String, required: true },
  items: { type: [VideoItemSchema], default: [] },
  fetchedAt: { type: Date, default: Date.now },
  nextPageToken: { type: String },
})

VideoCacheSchema.index({ languageCode: 1, category: 1 }, { unique: true })

if (mongoose.models.VideoCache) mongoose.deleteModel('VideoCache')
const VideoCache: Model<IVideoCache> = mongoose.model<IVideoCache>('VideoCache', VideoCacheSchema)
export default VideoCache
