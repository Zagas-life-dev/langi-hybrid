import { connectDB } from '@/lib/db'
import VideoDoc, { type IVideoDoc } from '@/lib/models/VideoDoc'
import type { IVideoItem } from '@/lib/models/VideoCache'
import type { CefrLevel } from '@/lib/models/LangiUser'

// ---------------------------------------------------------------------------
// Video tagging + difficulty. Every video gets instant keyword-based tags and difficulty on first
// sight (free, deterministic). There is no server-side AI pass: every AI call in the app goes through
// Firebase AI Logic in the browser.
// ---------------------------------------------------------------------------

// Topic → keywords. A tag is attached when any of its keywords appears in the
// title/description. Kept deliberately small and learning-oriented.
const TAG_KEYWORDS: Record<string, string[]> = {
  grammar: ['grammar', 'conjugation', 'tense', 'verb', 'pronoun', 'syntax', 'gender', 'plural'],
  vocabulary: ['vocabulary', 'vocab', 'words', 'phrases', 'expressions'],
  pronunciation: ['pronunciation', 'accent', 'sounds', 'phonetics', 'speaking'],
  listening: ['listening', 'comprehension', 'comprehensible input', 'immersion', 'podcast'],
  conversation: ['conversation', 'dialogue', 'speaking', 'talk', 'chat', 'interview'],
  reading: ['reading', 'story', 'stories', 'text', 'book'],
  travel: ['travel', 'trip', 'holiday', 'vacation', 'restaurant', 'hotel', 'airport'],
  // "Speak like a local" themes — the core of the Shorts market.
  slang: ['slang', 'informal', 'colloquial', 'idiom', 'idioms', 'expression', 'expressions', 'street'],
  memes: ['meme', 'memes', 'viral', 'trend', 'trending', 'pov', 'relatable'],
  culture: ['culture', 'history', 'tradition', 'food', 'cuisine', 'music', 'film', 'movie', 'local', 'locals', 'native'],
  business: ['business', 'work', 'office', 'professional', 'job', 'meeting'],
  exam: ['exam', 'test', 'delf', 'dele', 'goethe', 'cils', 'certificate', 'b1', 'b2', 'c1'],
  numbers: ['numbers', 'counting', 'time', 'dates', 'money'],
  kids: ['kids', 'children', 'nursery', 'cartoon'],
}

const BEGINNER_CUES = ['beginner', 'beginners', 'basics', 'basic', 'a1', 'a2', 'easy', 'for kids', 'first words', 'starter', 'absolute beginner']
const INTERMEDIATE_CUES = ['intermediate', 'b1', 'b2', 'improve', 'pre-intermediate', 'upper intermediate']
const ADVANCED_CUES = ['advanced', 'c1', 'c2', 'fluent', 'fluency', 'native', 'mastery', 'proficiency']

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

/** Topic tags inferred from a video's title + description. */
export function keywordTags(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase()
  const tags: string[] = []
  for (const [tag, words] of Object.entries(TAG_KEYWORDS)) {
    if (hasAny(text, words)) tags.push(tag)
  }
  return tags.slice(0, 8)
}

/** Rough CEFR difficulty from explicit level cues; null when none are present. */
export function keywordDifficulty(title: string, description: string): CefrLevel | null {
  const text = `${title} ${description}`.toLowerCase()
  if (hasAny(text, ADVANCED_CUES)) return 'C1'
  if (hasAny(text, INTERMEDIATE_CUES)) return 'B1'
  if (hasAny(text, BEGINNER_CUES)) return 'A1'
  return null
}

/**
 * Ensure a VideoDoc exists for `item`, seeded with keyword tags/difficulty.
 * Idempotent and non-destructive: an existing doc keeps its AI refinements.
 */
export async function upsertVideoDoc(
  item: IVideoItem,
  lang: string,
  opts: { isShort?: boolean; durationSeconds?: number } = {}
): Promise<IVideoDoc | null> {
  if (!item?.videoId) return null
  await connectDB()
  const tags = keywordTags(item.title, item.description)
  const difficulty = keywordDifficulty(item.title, item.description)
  return VideoDoc.findOneAndUpdate(
    { videoId: item.videoId },
    {
      // Refresh display metadata every time we see the video.
      $set: {
        languageCode: lang,
        title: item.title,
        channelTitle: item.channelTitle,
        description: item.description,
        thumbnail: item.thumbnail,
        ...(opts.isShort !== undefined ? { isShort: opts.isShort } : {}),
        ...(opts.durationSeconds !== undefined ? { durationSeconds: opts.durationSeconds } : {}),
      },
      // Seed tags/difficulty only on insert so we never clobber AI results.
      $setOnInsert: { tags, difficulty },
    },
    { upsert: true, returnDocument: 'after' }
  )
}

/** Bulk variant for caching a search page of results. */
export async function upsertVideoDocs(items: IVideoItem[], lang: string, isShort = false): Promise<void> {
  await Promise.all(items.map((i) => upsertVideoDoc(i, lang, { isShort })))
}
