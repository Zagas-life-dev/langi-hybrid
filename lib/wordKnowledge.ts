import { connectDB } from '@/lib/db'
import Card from '@/lib/models/Card'
import Deck from '@/lib/models/Deck'
import UserCard from '@/lib/models/UserCard'
import VideoDoc from '@/lib/models/VideoDoc'
import { CEFR_LEVELS, type ILangiUser } from '@/lib/models/LangiUser'
import type { ICaptionCue } from '@/lib/models/CaptionCache'
import { lemmatize } from '@/lib/lemma'
import { getCaptions } from '@/lib/captions'
import {
  tokenKeys, variants, isFunctionWord, vocabProfile, coverageOf,
  type WordStatus, type VocabEntry, type Coverage,
} from '@/lib/wordsCore'

// ---------------------------------------------------------------------------
// "How much of this will I understand?" — no AI involved.
//   Learner side: which words they know, from their SRS cards (box 3+ = known,
//   lower = learning), every system-deck word BELOW their CEFR level (presumed
//   known), and a built-in list of function words.
//   Video side: a word-count profile of its target-language captions, stored on
//   the VideoDoc the first time those captions are fetched.
// ---------------------------------------------------------------------------

const KNOWN_BOX = 3
const CACHE_MS = 2 * 60 * 1000
const PROFILE_RETRY_MS = 7 * 24 * 60 * 60 * 1000 // retry videos that had no captions

export interface Knowledge { lang: string; known: Set<string>; learning: Set<string> }

const cache = new Map<string, { at: number; k: Knowledge }>()

/** A card term's single-word key ("le chat" → chat), or null for phrases. */
function termKey(term: string): string | null {
  const keys = term.split(/\s+/).flatMap(tokenKeys)
  const content = keys.length > 1 ? keys.filter((k) => !/^(le|la|les|un|une|el|los|las|una|unos|unas)$/.test(k)) : keys
  return content.length === 1 ? content[0] : null
}

export async function userKnowledge(user: ILangiUser): Promise<Knowledge> {
  const lang = user.learningLang
  const cacheKey = `${user._id}:${lang}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.k

  await connectDB()
  const known = new Set<string>()
  const learning = new Set<string>()

  // Decks below the learner's level count as known until SRS says otherwise.
  const levelIdx = user.cefrLevel ? CEFR_LEVELS.indexOf(user.cefrLevel) : 0
  const easier = CEFR_LEVELS.slice(0, Math.max(0, levelIdx))
  if (easier.length) {
    const decks = await Deck.find({ languageCode: lang, isSystem: true, level: { $in: easier } }).select('_id').lean()
    const cards = await Card.find({ deckId: { $in: decks.map((d) => d._id) } }).select('term').lean()
    for (const c of cards) {
      const k = termKey(c.term)
      if (k) known.add(k)
    }
  }

  const ucs = await UserCard.find({ userId: user._id, languageCode: lang }).select('cardId box').lean()
  const boxByCard = new Map(ucs.map((u) => [String(u.cardId), u.box]))
  const cards = await Card.find({ _id: { $in: ucs.map((u) => u.cardId) }, cloze: { $exists: false } }).select('term').lean()
  // The same word can sit in several decks (a system deck and Saved words) —
  // its best box decides. SRS overrides the level presumption either way.
  const bestBox = new Map<string, number>()
  for (const c of cards) {
    const k = termKey(c.term)
    if (k) bestBox.set(k, Math.max(bestBox.get(k) ?? 0, boxByCard.get(String(c._id)) ?? 1))
  }
  for (const [k, box] of bestBox) {
    if (box >= KNOWN_BOX) known.add(k)
    else { known.delete(k); learning.add(k) }
  }

  const k = { lang, known, learning }
  cache.set(cacheKey, { at: Date.now(), k })
  return k
}

/** Forget a learner's cached knowledge (after saving a word, say). */
export function invalidateKnowledge(user: ILangiUser) {
  cache.delete(`${user._id}:${user.learningLang}`)
}

export function statusOf(k: Knowledge, key: string): WordStatus {
  const lemma = lemmatize(k.lang, key)?.infinitive
  const forms = lemma ? [...variants(key), lemma] : variants(key)
  if (forms.some((f) => isFunctionWord(k.lang, f) || k.known.has(f))) return 'known'
  if (forms.some((f) => k.learning.has(f))) return 'learning'
  return 'new'
}

export function coverageFor(k: Knowledge, vocab: VocabEntry[]): Coverage {
  return coverageOf(vocab, (w) => statusOf(k, w))
}

/** Store the word profile of a video's target-language captions (once; empty = no captions). */
export async function saveVideoProfile(videoId: string, lang: string, cues: ICaptionCue[]) {
  await connectDB()
  const { vocab, total } = vocabProfile(cues.map((c) => c.text))
  await VideoDoc.updateOne(
    { videoId, languageCode: lang, $or: [{ vocabTotal: { $exists: false } }, { vocabTotal: 0 }] },
    { $set: { vocab, vocabTotal: total, vocabAt: new Date() } },
  ).catch(() => {})
}

/** Profile a few videos in the background (no AI: the video's own track or nothing). */
export async function warmProfiles(videoIds: string[], lang: string) {
  for (const id of videoIds) {
    const r = await getCaptions(id, lang).catch(() => null)
    await saveVideoProfile(id, lang, r?.source === 'youtube' ? r.cues : [])
  }
}

/** Videos (of these ids) still needing a profile — never tried, or tried long ago with no captions. */
export async function unprofiled(videoIds: string[], lang: string, limit: number): Promise<string[]> {
  await connectDB()
  const rows = await VideoDoc.find({
    videoId: { $in: videoIds },
    languageCode: lang,
    $or: [{ vocabAt: { $exists: false } }, { vocabTotal: 0, vocabAt: { $lt: new Date(Date.now() - PROFILE_RETRY_MS) } }],
  }).select('videoId').limit(limit).lean()
  return rows.map((r) => r.videoId)
}

/**
 * Coverage for every profiled video in `lang`. Cheaper than coverageByVideo for
 * a whole feed pool: it reads only the (few) profiled docs instead of sending
 * ~1k ids in an $in.
 */
export async function coverageForLang(user: ILangiUser, lang: string): Promise<Map<string, Coverage>> {
  const out = new Map<string, Coverage>()
  await connectDB()
  const docs = await VideoDoc.find({ languageCode: lang, vocabTotal: { $gt: 0 } }).select('videoId vocab').lean()
  if (!docs.length) return out
  const k = await userKnowledge(user)
  for (const d of docs) out.set(d.videoId, coverageFor(k, d.vocab ?? []))
  return out
}

/** Coverage per video id, for the ones that have a profile. */
export async function coverageByVideo(user: ILangiUser, videoIds: string[]): Promise<Map<string, Coverage>> {
  const out = new Map<string, Coverage>()
  if (!videoIds.length) return out
  await connectDB()
  const docs = await VideoDoc.find({ videoId: { $in: videoIds }, vocabTotal: { $gt: 0 } }).select('videoId vocab').lean()
  if (!docs.length) return out
  const k = await userKnowledge(user)
  for (const d of docs) out.set(d.videoId, coverageFor(k, d.vocab ?? []))
  return out
}
