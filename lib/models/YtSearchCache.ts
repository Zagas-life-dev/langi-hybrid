import mongoose, { Schema, Document, Model } from 'mongoose'
import type { IVideoItem } from './VideoCache'

// Caches the result of ANY YouTube search (query + duration + page) so the same
// search is never paid for twice within the TTL. This is the single choke point
// that keeps quota usage low across the curated feed, Shorts pagination, and the
// profile-driven For-You searches.
export interface IYtSearchCache extends Document {
  cacheKey: string
  items: IVideoItem[]
  nextPageToken?: string
  fetchedAt: Date
}

const ItemSchema = new Schema<IVideoItem>(
  {
    videoId: { type: String, required: true },
    title: { type: String, default: '' },
    channelTitle: { type: String, default: '' },
    description: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    publishedAt: { type: String },
    duration: { type: String },
  },
  { _id: false }
)

const YtSearchCacheSchema = new Schema<IYtSearchCache>({
  cacheKey: { type: String, required: true, unique: true, index: true },
  items: { type: [ItemSchema], default: [] },
  nextPageToken: { type: String },
  fetchedAt: { type: Date, default: Date.now },
})

if (mongoose.models.YtSearchCache) mongoose.deleteModel('YtSearchCache')
const YtSearchCache: Model<IYtSearchCache> = mongoose.model<IYtSearchCache>('YtSearchCache', YtSearchCacheSchema)
export default YtSearchCache
