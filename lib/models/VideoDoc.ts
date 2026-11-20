import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

// Canonical per-video index (one row per videoId). It is the single source of
// truth for a video's metadata, auto-tags and estimated difficulty, and it
// powers ranking, the "for your level" row, and playlist hydration. Upserted
// wherever a video is seen (feed caching, watch, playlist add).
export interface IVideoDoc extends Document {
  videoId: string
  languageCode: string
  title: string
  channelTitle: string
  description: string
  thumbnail: string
  durationSeconds?: number
  tags: string[]
  difficulty?: CefrLevel | null
  isShort: boolean
  aiTagged: boolean // true once an AI pass has refined tags + difficulty
  // Word counts from the target-language captions (lib/wordKnowledge.ts) —
  // compared with what a learner knows to show "you know 87% of the words".
  // vocabTotal 0 + vocabAt = tried, no captions.
  vocab?: { w: string; n: number }[]
  vocabTotal?: number
  vocabAt?: Date
  createdAt: Date
  updatedAt: Date
}

const VideoDoc: Model<IVideoDoc> = defineModel<IVideoDoc>({
  collection: 'videos',
  timestamps: true,
  key: ['videoId'],
  indexed: ['languageCode'],
  defaults: () => ({ title: '', channelTitle: '', description: '', thumbnail: '', tags: [], difficulty: null, isShort: false, aiTagged: false }),
})
export default VideoDoc
