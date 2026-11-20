import { defineModel, type Document, type Model } from '@/lib/db/model'
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

const YtSearchCache: Model<IYtSearchCache> = defineModel<IYtSearchCache>({
  collection: 'ytSearchCaches',
  key: ['cacheKey'],
  defaults: () => ({ items: [], fetchedAt: new Date() }),
})
export default YtSearchCache
