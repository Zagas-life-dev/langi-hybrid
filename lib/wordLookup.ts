import { connectDB } from '@/lib/db'
import { lexiconLookup, lexiconStore, type LexEntry } from '@/lib/lexicon'
import { lemmatize } from '@/lib/lemma'
import Card from '@/lib/models/Card'
import Deck from '@/lib/models/Deck'
import type { ILangiUser, CefrLevel } from '@/lib/models/LangiUser'

// Word translation shared by every "tap a word" surface (stories, chat, videos,
// dictation). DATABASE FIRST, AI LAST:
//   1. Lexicon — the dictionary built up from earlier lookups
//   2. Curated deck cards — ~1,500 hand-written entries per language
//   3. Conjugation tables — "mangé" → manger, then retry 1–2 on the infinitive
//   4. AI — only when all of the above miss. It runs in the BROWSER (Firebase AI Logic):
//      the server answers `needsAi` and the client retries with `aiEntry`.
// Any database hit is written back to the lexicon so the next lookup is one query,
// and a lookup still works when the AI backends are down or rate-limited.

export type LookupOutcome =
  | { ok: true; entry: LexEntry; cached: boolean }
  | { ok: false; status: number; error: string; retryAfter?: number; needsAi?: boolean }

export const MAX_TERM_LENGTH = 80

// Deck terms carry their article ("le pain", "el pan"), so a bare tapped noun
// has to be tried with each one.
const ARTICLES: Record<string, string[]> = {
  fr: ['le ', 'la ', 'les ', "l'", 'un ', 'une ', 'des '],
  es: ['el ', 'la ', 'los ', 'las ', 'un ', 'una '],
  de: ['der ', 'die ', 'das ', 'ein ', 'eine '],
  it: ['il ', 'lo ', 'la ', "l'", 'i ', 'gli ', 'le ', 'un ', 'una '],
  pt: ['o ', 'a ', 'os ', 'as ', 'um ', 'uma '],
}

function candidates(lang: string, word: string): string[] {
  const w = word.trim().toLowerCase().replace(/’/g, "'")
  return [w, ...(ARTICLES[lang] || []).map((a) => a + w)]
}

/** Look a term up in the curated (system) decks for the language. */
async function deckLookup(lang: string, word: string): Promise<LexEntry | null> {
  await connectDB()
  const decks = await Deck.find({ languageCode: lang, isSystem: true }).select('_id level').lean()
  if (!decks.length) return null
  const levelByDeck = new Map(decks.map((d) => [String(d._id), d.level as CefrLevel]))
  const cands = candidates(lang, word)
  const cards = await Card.find({ deckId: { $in: decks.map((d) => d._id) }, term: { $in: cands } })
    // Case-insensitive but accent-sensitive ("a" ≠ "à").
    .collation({ locale: lang, strength: 2 })
    .select('term translation partOfSpeech gender deckId')
    .lean()
  if (!cards.length) return null
  // Prefer the exact form over an article-prefixed one.
  cards.sort((a, b) => cands.indexOf(a.term.toLowerCase()) - cands.indexOf(b.term.toLowerCase()))
  const c = cards[0]
  return {
    translation: c.translation,
    partOfSpeech: c.partOfSpeech,
    gender: c.gender,
    level: levelByDeck.get(String(c.deckId)) ?? null,
  }
}

/** Lexicon, then curated decks. Deck hits are copied into the lexicon. */
async function databaseLookup(lang: string, term: string): Promise<LexEntry | null> {
  const hit = await lexiconLookup(lang, term)
  if (hit) return hit
  const deck = await deckLookup(lang, term)
  if (deck) await lexiconStore(lang, term, deck, 'seed')
  return deck
}

export async function lookupWord(dbUser: ILangiUser, lang: string, rawTerm: string, aiEntry?: unknown): Promise<LookupOutcome> {
  const term = rawTerm.trim()
  if (!term) return { ok: false, status: 400, error: 'No word provided' }
  if (term.length > MAX_TERM_LENGTH) return { ok: false, status: 400, error: 'That looks too long to save as a word' }

  // 1–2. Dictionary + curated decks for the word as tapped.
  const direct = await databaseLookup(lang, term)
  if (direct) return { ok: true, entry: direct, cached: true }

  // 3. A conjugated verb? Answer from its infinitive.
  const lemma = lemmatize(lang, term)
  if (lemma && lemma.infinitive.toLowerCase() !== term.toLowerCase()) {
    const base = (await databaseLookup(lang, lemma.infinitive))
      ?? (lemma.english ? { translation: lemma.english, partOfSpeech: 'verb' } : null)
    if (base) {
      const entry: LexEntry = {
        ...base,
        partOfSpeech: base.partOfSpeech || 'verb',
        gender: undefined,
        translation: `${base.translation} (form of ${lemma.infinitive})`,
      }
      await lexiconStore(lang, term, entry, 'seed')
      return { ok: true, entry, cached: true }
    }
  }

  // 4. Nothing in the database. The browser translates it (Firebase AI Logic) and retries
  //    with `aiEntry`; we validate it and remember it.
  const ai = cleanAiEntry(aiEntry)
  if (!ai) {
    const hint = lemma ? ` It looks like a form of “${lemma.infinitive}”.` : ''
    return { ok: false, status: 424, needsAi: true, error: `Not in the dictionary yet.${hint}` }
  }
  await lexiconStore(lang, term, ai, 'ai')
  return { ok: true, entry: ai, cached: false }
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Sanitise a dictionary entry produced by the browser's on-device/cloud model. */
export function cleanAiEntry(raw: unknown): LexEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const translation = typeof r.translation === 'string' ? r.translation.trim().slice(0, 120) : ''
  if (!translation) return null
  const gender = typeof r.gender === 'string' ? r.gender.trim().toLowerCase() : ''
  const level = typeof r.level === 'string' ? r.level.trim().toUpperCase() : ''
  return {
    translation,
    partOfSpeech: typeof r.partOfSpeech === 'string' && r.partOfSpeech.trim() ? r.partOfSpeech.trim().slice(0, 40) : undefined,
    gender: ['m', 'f', 'mf'].includes(gender) ? gender : undefined,
    level: (LEVELS.includes(level) ? level : undefined) as CefrLevel | undefined,
  }
}
