import mongoose, { Schema, Document, Model } from 'mongoose'

// Cache of generated speech audio — deliberately PERMANENT.
//
// The content that gets read aloud is fixed: a grammar lesson's explanation and
// a graded story's sentences are byte-identical for every learner, forever. So
// the first person to play them pays the generation cost and everyone after
// gets it free and instant. There is no reason to ever re-buy that audio, which
// is why this collection has no TTL — an earlier 30-day expiry meant paying
// again every month for text that had not changed.
//
// Size is kept sane by encoding to MP3 rather than by expiry: ~24 KB/clip
// instead of ~289 KB as WAV (see lib/expressiveTts.ts). Full grammar coverage
// across two languages lands around 115 MB rather than 0.9 GB.
//
// `key` is a hash of everything that changes the audio — the PRIMARY model,
// voice, language, style and the text itself — so bumping GEMINI_TTS_MODEL
// naturally orphans the old entries instead of serving stale audio from a
// different voice. It deliberately hashes the primary model rather than the one
// that actually generated the clip: when the primary is out of quota a fallback
// model serves the request (see the cascade in lib/expressiveTts.ts), and that
// audio must still be findable on the next lookup — which can only ever be made
// with the primary. `model` records what really produced it, for stats only.
// Exactly one of `url` or `audio` is populated, depending on the active audio
// backend (lib/audioStore.ts):
//   url   — clip lives on the Cloudinary CDN; this row is just the index entry,
//           so the database stays tiny no matter how much audio exists.
//   audio — no CDN configured, bytes are stored here and streamed by /api/tts.
// Rows written under one backend keep working after a switch, because the read
// path checks `url` first and falls back to `audio`.
export interface ITtsCache extends Document {
  key: string
  /** CDN URL when the clip is stored externally. */
  url?: string
  /** Inline bytes when there's no external store. */
  audio?: Buffer
  mimeType: string
  bytes: number
  /** Denormalised for the stats/eviction tooling; not part of the key. */
  lang: string
  style: string
  /** Which model in the cascade actually generated this clip. Stats only.
   *  (Not called `model` — that name is taken by Document.model().) */
  genModel?: string
  /** Cheap popularity signal, so cold entries can be found if space ever matters. */
  hits: number
  lastUsedAt: Date
  createdAt: Date
}

const TtsCacheSchema = new Schema<ITtsCache>({
  key: { type: String, required: true, unique: true, index: true },
  // Neither is `required` — which one is set depends on the active backend.
  url: { type: String },
  audio: { type: Buffer },
  mimeType: { type: String, required: true },
  bytes: { type: Number, required: true },
  lang: { type: String, default: '' },
  style: { type: String, default: '' },
  genModel: { type: String },
  hits: { type: Number, default: 0 },
  lastUsedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
})

// No TTL index — see above. This index exists so a future cleanup job can find
// genuinely cold entries by hand; nothing expires on its own.
TtsCacheSchema.index({ lastUsedAt: 1 })

if (mongoose.models.TtsCache) mongoose.deleteModel('TtsCache')
const TtsCache: Model<ITtsCache> = mongoose.model<ITtsCache>('TtsCache', TtsCacheSchema)
export default TtsCache
