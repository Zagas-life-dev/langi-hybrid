import mongoose, { Schema, Document, Model } from 'mongoose'

// Parsed subtitle cues for one (video, language). A video's captions don't
// change, so the first learner to open a language pays the fetch (or, for an
// AI-translated track, the translation) and everyone after gets it instantly.
// `source` records where the lines came from: a real YouTube track, or an AI
// translation of another track (`from`) when the video has none in that language.
// Rows expire after 30 days so a later-added official track can replace an AI one.

export interface ICaptionCue { start: number; end: number; text: string }

export interface ICaptionCache extends Document {
  videoId: string
  lang: string
  cues: ICaptionCue[]
  source: 'youtube' | 'ai'
  from?: string
  parts?: number   // AI translations: total parts (each row holds one, keyed `lang#part`)
  ver?: number     // parser version; rows from an older parser are ignored
  fetchedAt: Date
}

const CueSchema = new Schema<ICaptionCue>(
  { start: Number, end: Number, text: String },
  { _id: false }
)

const CaptionCacheSchema = new Schema<ICaptionCache>({
  videoId: { type: String, required: true },
  lang: { type: String, required: true },
  cues: { type: [CueSchema], default: [] },
  source: { type: String, enum: ['youtube', 'ai'], required: true },
  from: { type: String },
  parts: { type: Number },
  ver: { type: Number },
  fetchedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
})

CaptionCacheSchema.index({ videoId: 1, lang: 1 }, { unique: true })

if (mongoose.models.CaptionCache) mongoose.deleteModel('CaptionCache')
const CaptionCache: Model<ICaptionCache> = mongoose.model<ICaptionCache>('CaptionCache', CaptionCacheSchema)
export default CaptionCache
