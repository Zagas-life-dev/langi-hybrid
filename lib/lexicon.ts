import { connectDB } from '@/lib/db'
import Lexicon from '@/lib/models/Lexicon'
import type { CefrLevel } from '@/lib/models/LangiUser'

// Indexed word/phrase dictionary. The translate flow checks here FIRST (free);
// only a miss costs an AI call, whose result is written back via lexiconStore so
// it's free forever after. See lib/models/Lexicon.ts.

export interface LexEntry {
  translation: string
  partOfSpeech?: string
  gender?: string
  level?: CefrLevel | null
}

/** Normalized dictionary key: trimmed, lowercased, single-spaced. */
function normalize(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Dictionary lookup. Returns the entry or null (no AI, no network). */
export async function lexiconLookup(lang: string, term: string): Promise<LexEntry | null> {
  const key = normalize(term)
  if (!key) return null
  await connectDB()
  const hit = await Lexicon.findOne({ languageCode: lang, term: key }).lean()
  if (!hit) return null
  return { translation: hit.translation, partOfSpeech: hit.partOfSpeech, gender: hit.gender, level: hit.level }
}

/**
 * Add/refresh a dictionary entry. `source` records where it came from. Existing
 * entries keep their level unless a better-sourced one supplies it (an AI entry
 * fills a level a tutor entry left blank).
 */
export async function lexiconStore(
  lang: string,
  term: string,
  entry: LexEntry,
  source: 'ai' | 'tutor' | 'seed' = 'ai'
): Promise<void> {
  const key = normalize(term)
  if (!key || !entry.translation?.trim()) return
  await connectDB()
  await Lexicon.findOneAndUpdate(
    { languageCode: lang, term: key },
    {
      $set: {
        translation: entry.translation.trim(),
        ...(entry.partOfSpeech ? { partOfSpeech: entry.partOfSpeech } : {}),
        ...(entry.gender ? { gender: entry.gender } : {}),
        ...(entry.level ? { level: entry.level } : {}),
        source,
      },
      $setOnInsert: { languageCode: lang, term: key, display: term.trim() },
    },
    { upsert: true }
  )
}
