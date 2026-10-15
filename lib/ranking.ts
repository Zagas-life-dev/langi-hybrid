import { connectDB } from '@/lib/db'
import VideoDoc, { type IVideoDoc } from '@/lib/models/VideoDoc'
import WatchHistory from '@/lib/models/WatchHistory'
import Playlist, { type IPlaylistItem } from '@/lib/models/Playlist'
import VideoLike from '@/lib/models/VideoLike'
import { SWEET_SPOT } from '@/lib/wordsCore'
import type { ILangiUser, CefrLevel } from '@/lib/models/LangiUser'
import { getLearningVideos, searchForYou } from '@/lib/youtube'
import { upsertVideoDocs } from '@/lib/videoIndex'
import type { Types } from 'mongoose'

// ---------------------------------------------------------------------------
// Video recommendations. Scores candidate videos for a learner from:
//   channel affinity — channels they watch through, finish, like and save
//   topic affinity   — the same engagement, spread over each video's tags
//   co-watch         — what learners who finished/liked the same videos finished
//   level fit        — how close the video's difficulty is to their CEFR level
//   word coverage    — a bonus in the comprehensible-input sweet spot
// Then the order is a WEIGHTED SHUFFLE (higher score => likelier near the top,
// but never a fixed order) so the feed stays fresh on every load, followed by a
// diversity pass so one channel can't take over the grid. Already-watched
// videos are excluded (repetition control); they live in Continue watching.
// ---------------------------------------------------------------------------

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function levelIndex(level?: CefrLevel | null): number {
  const i = level ? LEVEL_ORDER.indexOf(level) : -1
  return i === -1 ? 0 : i // default new learners toward A1
}

/** Video IDs the user has already watched (for repetition control). */
export async function watchedVideoIds(userId: Types.ObjectId | string, lang: string): Promise<Set<string>> {
  await connectDB()
  const rows = await WatchHistory.find({ userId, languageCode: lang }).select('videoId').lean()
  return new Set(rows.map((r) => r.videoId))
}

/** What a learner's engagement says they like. All maps are raw weights. */
export interface EngagementProfile {
  tags: Record<string, number>
  channels: Record<string, number>
  /** videoId → how strongly similar learners engaged with it. */
  coWatch: Record<string, number>
  /** Videos the learner has liked, most recent first (for the Liked tab). */
  liked: string[]
}

export const EMPTY_PROFILE: EngagementProfile = { tags: {}, channels: {}, coWatch: {}, liked: [] }

const DAY = 24 * 3600 * 1000
/** Engagement fades with a ~30-day half-life (floored), so tastes can move on. */
const decay = (at?: Date) => (at ? Math.max(0.25, 0.5 ** ((Date.now() - new Date(at).getTime()) / (30 * DAY))) : 1)

/**
 * Per-video engagement weight → channel + tag profile, plus co-watch scores.
 * Signals: share watched, finishing (and rewatching), likes, saves to the
 * learner's own playlists; a quick bounce (<10% watched) counts for little.
 */
export async function engagementProfile(userId: Types.ObjectId | string, lang: string): Promise<EngagementProfile> {
  await connectDB()
  const [history, likes, playlists] = await Promise.all([
    WatchHistory.find({ userId, languageCode: lang }).select('videoId completed completions position duration watchedAt').lean(),
    VideoLike.find({ userId, languageCode: lang }).sort({ createdAt: -1 }).select('videoId createdAt').lean(),
    Playlist.find({ ownerId: userId, languageCode: lang }).select('items.videoId updatedAt').lean(),
  ])

  const weight = new Map<string, number>()
  const add = (id: string, w: number) => weight.set(id, (weight.get(id) || 0) + w)
  for (const h of history) {
    const frac = h.completed ? 1 : h.duration > 0 ? Math.min(1, h.position / h.duration) : 0
    const bounced = !h.completed && h.duration > 0 && h.position > 0 && frac < 0.1
    const w = bounced ? 0.2 : 0.5 + 2 * frac + (h.completed ? 1.5 : 0) + 0.5 * Math.min(2, h.completions || 0)
    add(h.videoId, w * decay(h.watchedAt))
  }
  for (const l of likes) add(l.videoId, 4 * decay(l.createdAt))
  for (const p of playlists) for (const i of p.items || []) add(i.videoId, 3 * decay(p.updatedAt))
  if (!weight.size) return EMPTY_PROFILE

  const docs = await VideoDoc.find({ videoId: { $in: [...weight.keys()] } }).select('videoId tags channelTitle').lean()
  const tags: Record<string, number> = {}
  const channels: Record<string, number> = {}
  for (const d of docs) {
    const w = weight.get(d.videoId) ?? 0
    if (d.channelTitle) channels[d.channelTitle] = (channels[d.channelTitle] || 0) + w
    for (const t of d.tags || []) tags[t] = (tags[t] || 0) + w
  }

  return { tags, channels, coWatch: await coWatchScores(userId, lang, weight), liked: likes.map((l) => l.videoId) }
}

/**
 * "Learners who finished what you finished also finished…". Peers are other
 * users who completed or liked any of this learner's strongest videos, weighted
 * by how many they share; their completed/liked videos are scored by that.
 * Bounded queries — cheap at Langi's scale.
 */
async function coWatchScores(userId: Types.ObjectId | string, lang: string, weight: Map<string, number>): Promise<Record<string, number>> {
  const seeds = [...weight].filter(([, w]) => w >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id]) => id)
  if (!seeds.length) return {}
  const [peerWatches, peerLikes] = await Promise.all([
    WatchHistory.find({ videoId: { $in: seeds }, completed: true, userId: { $ne: userId } }).select('userId').limit(500).lean(),
    VideoLike.find({ videoId: { $in: seeds }, userId: { $ne: userId } }).select('userId').limit(500).lean(),
  ])
  const overlap = new Map<string, number>()
  for (const r of [...peerWatches, ...peerLikes]) overlap.set(String(r.userId), (overlap.get(String(r.userId)) || 0) + 1)
  if (!overlap.size) return {}
  const peers = [...overlap.keys()].slice(0, 200)
  const [theirWatches, theirLikes] = await Promise.all([
    WatchHistory.find({ userId: { $in: peers }, languageCode: lang, completed: true }).select('userId videoId').limit(3000).lean(),
    VideoLike.find({ userId: { $in: peers }, languageCode: lang }).select('userId videoId').limit(3000).lean(),
  ])
  const scores: Record<string, number> = {}
  for (const r of [...theirWatches, ...theirLikes]) {
    scores[r.videoId] = (scores[r.videoId] || 0) + (overlap.get(String(r.userId)) || 0)
  }
  return scores
}

/** Back-compat: just the topic half of the profile. */
export async function userInterestTags(userId: Types.ObjectId | string, lang: string): Promise<Record<string, number>> {
  return (await engagementProfile(userId, lang)).tags
}

const maxOf = (r: Record<string, number>) => Math.max(1, ...Object.values(r))

function tagAffinity(tags: string[], profile: Record<string, number>, max: number): number {
  let sum = 0
  for (const t of tags) sum += (profile[t] || 0) / max
  return Math.min(1, sum) // cap so a single hot tag can't dominate
}

interface Rankable {
  videoId: string
  channelTitle?: string
  tags?: string[]
  difficulty?: CefrLevel | null
}

/** Relevance score > 0 for one candidate. */
function scoreVideo(
  c: Rankable,
  userIdx: number,
  p: EngagementProfile,
  max: { tag: number; ch: number; co: number },
  coverage?: number
): number {
  const dist = c.difficulty ? Math.abs(levelIndex(c.difficulty) - userIdx) : 1 // unknown ≈ one level off
  const levelFit = Math.max(0, 1 - dist / 2)
  const topic = tagAffinity(c.tags || [], p.tags, max.tag)
  const channel = c.channelTitle ? (p.channels[c.channelTitle] || 0) / max.ch : 0
  const co = (p.coWatch[c.videoId] || 0) / max.co
  let fit = 0
  if (coverage !== undefined) {
    if (coverage >= SWEET_SPOT.min && coverage <= SWEET_SPOT.max) fit = 1 - Math.abs(coverage - SWEET_SPOT.ideal) / 0.1
    else if (coverage < 0.7) fit = -0.3 // mostly unknown words: frustrating
  }
  return Math.max(0.05, 0.3 + levelFit * 0.7 + topic * 0.5 + channel * 1.1 + co * 0.8 + fit * 0.5)
}

/**
 * Weighted shuffle (Efraimidis–Spirakis): each item draws key = u^(1/w) and we
 * sort by key. The chance of landing early grows with the weight, so strong
 * matches lead most of the time — but every load is a different arrangement
 * and the long tail still surfaces. w = e^(3·score) keeps a few dozen strong
 * matches ahead of a ~1k-video pool (roughly 4 in 5 top slots) while leaving
 * room for discovery.
 */
function weightedShuffle<T>(items: { c: T; score: number }[], rng: () => number): T[] {
  return items
    .map((s) => ({ c: s.c, key: Math.log(rng() || Number.MIN_VALUE) / Math.exp(3 * s.score) }))
    .sort((a, b) => b.key - a.key)
    .map((s) => s.c)
}

/**
 * Seeded PRNG (mulberry32). Pagination passes the same seed for every page of
 * one browse, so page 2 continues page 1's shuffle; a new visit gets a new seed.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Reorder so a channel never repeats within `gap` slots, when avoidable. */
function spreadChannels<T extends Rankable>(items: T[], gap = 3): T[] {
  const rest = [...items]
  const out: T[] = []
  while (rest.length) {
    const recent = new Set(out.slice(-gap).map((v) => v.channelTitle))
    const i = rest.findIndex((v) => !v.channelTitle || !recent.has(v.channelTitle))
    out.push(rest.splice(i === -1 ? 0 : i, 1)[0])
  }
  return out
}

/** Order candidates for this user (weighted shuffle + channel spread). Watched IDs are removed. */
export function rankVideos<T extends Rankable>(
  user: Pick<ILangiUser, 'cefrLevel'>,
  candidates: T[],
  watched: Set<string>,
  profile: EngagementProfile = EMPTY_PROFILE,
  coverage?: Map<string, number>,
  rng: () => number = Math.random
): T[] {
  const userIdx = levelIndex(user.cefrLevel)
  const max = { tag: maxOf(profile.tags), ch: maxOf(profile.channels), co: maxOf(profile.coWatch) }
  const scored = candidates
    .filter((c) => !watched.has(c.videoId))
    .map((c) => ({ c, score: scoreVideo(c, userIdx, profile, max, coverage?.get(c.videoId)) }))
  return spreadChannels(weightedShuffle(scored, rng))
}

/**
 * Rank any candidate list for a learner. Watched videos are dropped unless that
 * would leave fewer than `minUnwatched` (small category tabs stay populated).
 */
export function rankForUser<T extends Rankable>(
  user: Pick<ILangiUser, 'cefrLevel'>,
  candidates: T[],
  ctx: { profile: EngagementProfile; watched: Set<string>; coverage?: Map<string, number>; minUnwatched?: number; rng?: () => number }
): T[] {
  const unwatched = candidates.filter((c) => !ctx.watched.has(c.videoId)).length
  const exclude = unwatched >= (ctx.minUnwatched ?? 0) ? ctx.watched : new Set<string>()
  return rankVideos(user, candidates, exclude, ctx.profile, ctx.coverage, ctx.rng)
}

/** Fields ranking + tiles need — skipping descriptions and word profiles keeps a ~1k-doc pool fast. */
const POOL_FIELDS = 'videoId languageCode title channelTitle thumbnail tags difficulty isShort durationSeconds'
/** Clips tagged #shorts belong in the Shorts feed, not long-form recommendations. */
const SHORTS_TAG = /#shorts?\b/i

/** Pool per language, kept in memory briefly — it changes slowly and is the biggest read. */
const POOL_TTL_MS = 10 * 60 * 1000
const poolCache = new Map<string, { at: number; docs: IVideoDoc[] }>()

/** Build (and index) a candidate pool of non-short videos for the language. */
export async function candidatePool(lang: string): Promise<IVideoDoc[]> {
  const hit = poolCache.get(lang)
  if (hit && Date.now() - hit.at < POOL_TTL_MS) return hit.docs
  await connectDB()
  const load = async () =>
    (await VideoDoc.find({ languageCode: lang, isShort: false }).select(POOL_FIELDS).lean()).filter((d) => !SHORTS_TAG.test(d.title))
  let docs = await load()
  // Cold start: seed VideoDocs from the curated feed so ranking has data.
  if (docs.length < 12) {
    const { categories } = await getLearningVideos(lang)
    const items = categories.flatMap((c) => c.items)
    if (items.length) {
      await upsertVideoDocs(items, lang, false)
      docs = await load()
    }
  }
  poolCache.set(lang, { at: Date.now(), docs })
  return docs
}

/** Drop the cached pool so newly indexed videos (e.g. a For-you refresh) show up now. */
export function invalidateCandidatePool(lang: string) {
  poolCache.delete(lang)
}

/** Top-N ranked recommendations for the learner, excluding watched + current. */
export async function getRankedRecommendations(
  user: ILangiUser,
  excludeVideoId?: string,
  limit = 12
): Promise<IVideoDoc[]> {
  const lang = user.learningLang
  const [pool, watched, profile] = await Promise.all([
    candidatePool(lang),
    watchedVideoIds(user._id as Types.ObjectId, lang),
    engagementProfile(user._id as Types.ObjectId, lang),
  ])
  if (excludeVideoId) watched.add(excludeVideoId)
  return rankVideos(user, pool, watched, profile).slice(0, limit)
}

/**
 * The personalized "For You" feed. Pulls FRESH videos from YouTube matching the
 * learner's interest profile + level (cached, so it's cheap), indexes them, then
 * ranks the whole pool — so it recommends "the kind of videos they tend to
 * watch" and surfaces new ones. `refresh` busts the search cache for variety.
 */
export async function getForYou(user: ILangiUser, opts: { limit?: number; refresh?: boolean } = {}): Promise<IVideoDoc[]> {
  const lang = user.learningLang
  const limit = opts.limit ?? 20
  const profile = await engagementProfile(user._id as Types.ObjectId, lang)
  const topTags = Object.entries(profile.tags).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3)

  // Bring in fresh, profile-matched videos (cached unless refreshing).
  const fresh = await searchForYou(lang, topTags, user.cefrLevel, opts.refresh)
  if (fresh.length) await upsertVideoDocs(fresh, lang, false)
  if (opts.refresh) invalidateCandidatePool(lang)

  const [pool, watched] = await Promise.all([
    candidatePool(lang),
    watchedVideoIds(user._id as Types.ObjectId, lang),
  ])
  return rankVideos(user, pool, watched, profile).slice(0, limit)
}

/** Videos at (or near) the learner's CEFR level — powers the "For your level" row. */
export async function getForYourLevel(user: ILangiUser, limit = 8): Promise<IVideoDoc[]> {
  const lang = user.learningLang
  const [pool, watched] = await Promise.all([
    candidatePool(lang),
    watchedVideoIds(user._id as Types.ObjectId, lang),
  ])
  const userIdx = levelIndex(user.cefrLevel)
  const atLevel = pool.filter((d) => d.difficulty && Math.abs(levelIndex(d.difficulty) - userIdx) <= 1)
  return rankVideos(user, atLevel.length ? atLevel : pool, watched).slice(0, limit)
}

export interface NextInCourse {
  playlistId: string
  playlistTitle: string
  item: IPlaylistItem
}

/**
 * The next unwatched item in a course the current video belongs to. Prefers the
 * course passed via the watch page's `?list=`, else any course containing the
 * video. Returns null when the video isn't in a course or the course is done.
 */
export async function nextInCourse(
  user: ILangiUser,
  currentVideoId: string,
  playlistId?: string
): Promise<NextInCourse | null> {
  await connectDB()
  const lang = user.learningLang
  const course = playlistId
    ? await Playlist.findOne({ _id: playlistId, isCourse: true }).lean()
    : await Playlist.findOne({ isCourse: true, languageCode: lang, 'items.videoId': currentVideoId }).lean()
  if (!course) return null

  const items = [...course.items].sort((a, b) => a.order - b.order)
  const idx = items.findIndex((i) => i.videoId === currentVideoId)
  if (idx === -1) return null

  const watched = await watchedVideoIds(user._id as Types.ObjectId, lang)
  for (let i = idx + 1; i < items.length; i++) {
    if (!watched.has(items[i].videoId)) {
      return { playlistId: String(course._id), playlistTitle: course.title, item: items[i] }
    }
  }
  return null
}
