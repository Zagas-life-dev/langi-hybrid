import { defineModel, type Document, type Model } from '@/lib/db/model'
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

const Lexicon: Model<ILexicon> = defineModel<ILexicon>({
  collection: 'lexicon',
  timestamps: true,
  key: ['languageCode', 'term'],
  indexed: ['languageCode'],
  defaults: () => ({ display: '', level: null, source: 'ai' }),
})
export default Lexicon
