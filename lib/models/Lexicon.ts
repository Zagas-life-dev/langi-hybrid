import mongoose, { Schema, Document, Model } from 'mongoose'
import type { CefrLevel } from './LangiUser'

// An indexed word/phrase dictionary, built up lazily. Lookups hit this FIRST
// (free); only a miss falls back to AI, whose result is then stored here — so the
// same term is never paid for twice. Each entry is categorised by CEFR level.
export interface ILexicon extends Document {
  languageCode: string
  term: string          // normalized key: trimmed, lowercased, single-spaced
  display: string       // first-seen surface form (for nicer display)
  translation: string
  partOfSpeech?: string
  gender?: string
  level?: CefrLevel | null
  source: 'ai' | 'tutor' | 'seed'
  createdAt: Date
  updatedAt: Date
}

const LexiconSchema = new Schema<ILexicon>(
  {
    languageCode: { type: String, required: true },
    term: { type: String, required: true },
    display: { type: String, default: '' },
    translation: { type: String, required: true },
    partOfSpeech: { type: String },
    gender: { type: String },
    level: { type: String, default: null },
    source: { type: String, enum: ['ai', 'tutor', 'seed'], default: 'ai' },
  },
  { timestamps: true }
)

// The dictionary key: one entry per (language, normalized term).
LexiconSchema.index({ languageCode: 1, term: 1 }, { unique: true })
// Browse/seed by level later (e.g. "show me A1 words").
LexiconSchema.index({ languageCode: 1, level: 1 })

if (mongoose.models.Lexicon) mongoose.deleteModel('Lexicon')
const Lexicon: Model<ILexicon> = mongoose.model<ILexicon>('Lexicon', LexiconSchema)
export default Lexicon
