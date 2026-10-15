import mongoose, { Schema, Document, Model } from 'mongoose'
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

const VideoDocSchema = new Schema<IVideoDoc>(
  {
    videoId: { type: String, required: true, unique: true, index: true },
    languageCode: { type: String, required: true, index: true },
    title: { type: String, default: '' },
    channelTitle: { type: String, default: '' },
    description: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    durationSeconds: { type: Number },
    tags: { type: [String], default: [], index: true },
    difficulty: { type: String, default: null },
    isShort: { type: Boolean, default: false },
    aiTagged: { type: Boolean, default: false },
    vocab: { type: [new Schema({ w: String, n: Number }, { _id: false })], default: undefined },
    vocabTotal: { type: Number },
    vocabAt: { type: Date },
  },
  { timestamps: true }
)

if (mongoose.models.VideoDoc) mongoose.deleteModel('VideoDoc')
const VideoDoc: Model<IVideoDoc> = mongoose.model<IVideoDoc>('VideoDoc', VideoDocSchema)
export default VideoDoc
