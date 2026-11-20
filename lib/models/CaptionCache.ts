import { defineModel, type Document, type Model } from '@/lib/db/model'

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

const CaptionCache: Model<ICaptionCache> = defineModel<ICaptionCache>({
  collection: 'captionCaches',
  key: ['videoId', 'lang'],
  defaults: () => ({ cues: [], fetchedAt: new Date() }),
})
export default CaptionCache
