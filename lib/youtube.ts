import { connectDB } from '@/lib/db'
import VideoCache, { type IVideoItem, type VideoCategory } from '@/lib/models/VideoCache'
import YtSearchCache from '@/lib/models/YtSearchCache'
import VideoDoc from '@/lib/models/VideoDoc'
import type { CefrLevel } from '@/lib/models/LangiUser'
import { langName } from '@/lib/langs'
import { upsertVideoDocs } from '@/lib/videoIndex'

// Curated learning-video feed: casual immersion → structured lessons → full
// classes → regular creators. Results are cached per (language, category) for
// 7 days to spare the YouTube Data API's 10k-unit/day quota.

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const PER_CATEGORY = 8

interface CategoryDef {
  key: 'casual' | 'lessons' | 'classes' | 'creators'
  label: string
  blurb: string
}

const CATEGORIES: CategoryDef[] = [
  { key: 'casual', label: 'Casual & immersion', blurb: 'Cartoons, podcasts, shows, interviews & films to tune your ear.' },
  { key: 'lessons', label: 'Structured lessons', blurb: 'Focused grammar and vocabulary explainers.' },
  { key: 'classes', label: 'Full classes & courses', blurb: 'Longer, course-style classes to study along.' },
  { key: 'creators', label: 'Regular creators', blurb: 'Channels worth subscribing to and following.' },
]

// ---------------------------------------------------------------------------
// Language packs — the feeds MUST be in the TARGET language, not English videos
// *about* it. So every query uses NATIVE-language terms, and searches pass
// relevanceLanguage + regionCode. English meme/learning queries are gone.
// ---------------------------------------------------------------------------
interface LangPack {
  native: string
  region: string
  lvl: { beg: string; int: string; adv: string } // native "for beginners"/"intermediate"/"advanced"
  shorts: string[]                  // native short-feed queries (immersion + culture)
  // Fun / immersion Shorts — cartoons, comedy, challenges, vlogs. Native-language
  // entertainment, NOT about learning, and not level-tagged (fun clips aren't
  // titled "for beginners"). Mixed with `shorts` in the default Shorts feed.
  shortsFun?: string[]
  categories: Record<CategoryDef['key'], string>
  // Casual & immersion is a deliberate MIX of fun, real-world content types —
  // cartoons, podcasts, shows, interviews, films — so the row feels like browsing
  // TV, not a lesson list. When present, it overrides `categories.casual`: we pull
  // a few from each native query and interleave them. Omit to keep one query.
  casualMix?: string[]
  // Hand-picked channel HANDLES (without the leading @) whose recent uploads seed
  // the Casual & immersion feed — e.g. native-language cartoon channels, the kind
  // of comprehensible, real-world content that's perfect for immersion. We pull
  // each channel's uploads playlist (cheap: ~1 unit each vs 100/search) and lead
  // the casual row with them, then top up with `casualMix` search results.
  casualChannels?: string[]
  // English-original channels that publish dubbed audio tracks in this language
  // (MrBeast & co). We pull a deeper slice of uploads and keep only videos with
  // a localized title — the creator's marker that a dub exists — so learners
  // never land on English audio. The player's `hl` then selects the dub.
  dubbedChannels?: string[]
  // Channel TITLES (exactly as YouTube reports them) that are deprecated: their
  // videos are filtered out of every fetched feed, even if a search returns them.
  // Purge already-cached copies with `npm run refresh-casual-channels`.
  blockedChannels?: string[]
}

const LANG_PACKS: Record<string, LangPack> = {
  fr: {
    native: 'français', region: 'FR', lvl: { beg: 'pour débutants', int: 'intermédiaire', adv: 'avancé' },
    shortsFun: ['dessin animé', 'sketch drôle', 'humour français', 'défi', 'prank', 'vlog', 'MrBeast en français', 'réaction drôle', 'animaux drôles', 'blague'],
    shorts: ['apprendre le français', 'français facile', 'leçon de français', 'expressions françaises', 'vocabulaire français', 'grammaire française', 'argot français expliqué', 'prononciation française', 'culture française', 'français pour débutants'],
    categories: {
      casual: 'français facile immersion histoires',
      lessons: 'leçon de français grammaire',
      classes: 'cours de français complet pour débutants',
      creators: 'meilleures chaînes pour apprendre le français',
    },
    casualMix: [
      'dessin animé en français',
      'podcast en français',
      'émission française',
      'interview en français',
      'film en français',
    ],
    // French cartoon channels — comprehensible immersion for learners. Handles
    // only (no leading @); their recent uploads lead the Casual & immersion row.
    casualChannels: [
      'LouLaSerieOfficiel',
      'SupaStrikasFrancais',
      'gullifr',
      'cartoon',
      'MagicFamilleFeerique',
      'NickelodeonFrance',
      'AngeloChaîneOfficielle',
      'francebeybladeofficial',
      'MyLittlePonyFrancaisOfficielle',
      'cartoonnetworkFR',
      'TiteufSaison4Off',
      'Miraculous_French',
      // Big French YouTubers — challenges, vlogs, sketches (MrBeast-style fun).
      'Squeezie',
      'Michou',
      'inoxtag',
      'Amixem',
      'TiboInShape',
      'mastu',
      'Lebouseuh',
      'cyprien',
      'NormanFaitDesVideos',
      'studiobagel',
      'LesKassos',
      'LeGrandJD',
      'LenaSituations',
      'Vilebrequin',
      'DrNozman',
      'FabienOlicard',
      'LeoDuff',
    ],
    dubbedChannels: ['MrBeast', 'MrBeast2', 'BeastReacts', 'BeastPhilanthropy'],
    blockedChannels: ["Les P'tits Diables - Chaîne Officielle"],
  },
  es: {
    native: 'español', region: 'ES', lvl: { beg: 'para principiantes', int: 'intermedio', adv: 'avanzado' },
    shortsFun: ['dibujos animados', 'sketch de humor', 'humor', 'reto', 'broma', 'vlog', 'MrBeast en español', 'animales graciosos'],
    shorts: ['aprender español', 'español fácil', 'lección de español', 'expresiones en español', 'vocabulario español', 'gramática española', 'jerga española explicada', 'pronunciación española', 'cultura española', 'español para principiantes'],
    categories: {
      casual: 'español fácil inmersión historias',
      lessons: 'lección de español gramática',
      classes: 'curso completo de español para principiantes',
      creators: 'mejores canales para aprender español',
    },
  },
  de: {
    native: 'Deutsch', region: 'DE', lvl: { beg: 'für Anfänger', int: 'Mittelstufe', adv: 'fortgeschritten' },
    shortsFun: ['Zeichentrick', 'Sketch lustig', 'Comedy', 'Challenge', 'Prank', 'Vlog', 'lustige Tiere'],
    shorts: ['Deutsch lernen', 'einfaches Deutsch', 'Deutsch Lektion', 'deutsche Redewendungen', 'deutscher Wortschatz', 'deutsche Grammatik', 'deutscher Slang erklärt', 'deutsche Aussprache', 'deutsche Kultur', 'Deutsch für Anfänger'],
    categories: {
      casual: 'einfaches Deutsch Immersion Geschichten',
      lessons: 'Deutsch Lektion Grammatik',
      classes: 'kompletter Deutschkurs für Anfänger',
      creators: 'beste Kanäle um Deutsch zu lernen',
    },
  },
  it: {
    native: 'italiano', region: 'IT', lvl: { beg: 'per principianti', int: 'intermedio', adv: 'avanzato' },
    shortsFun: ['cartoni animati', 'sketch divertente', 'comicità', 'sfida', 'scherzo', 'vlog', 'animali divertenti'],
    shorts: ["imparare l'italiano", 'italiano facile', 'lezione di italiano', 'espressioni italiane', 'vocabolario italiano', 'grammatica italiana', 'slang italiano spiegato', 'pronuncia italiana', 'cultura italiana', 'italiano per principianti'],
    categories: {
      casual: 'italiano facile immersione storie',
      lessons: 'lezione di italiano grammatica',
      classes: 'corso completo di italiano per principianti',
      creators: "migliori canali per imparare l'italiano",
    },
  },
}

/** Deprecated channel titles for `lang` — see LangPack.blockedChannels. */
export function blockedChannels(lang: string): string[] {
  return LANG_PACKS[lang]?.blockedChannels || []
}

function pack(lang: string): LangPack {
  return (
    LANG_PACKS[lang] || {
      native: langName(lang), region: '', lvl: { beg: 'for beginners', int: 'intermediate', adv: 'advanced' },
      shorts: [langName(lang)],
      categories: {
        casual: `easy ${langName(lang)}`,
        lessons: `${langName(lang)} lesson`,
        classes: `${langName(lang)} full course`,
        creators: `${langName(lang)} channel`,
      },
    }
  )
}

/** The learner's CEFR level expressed as a native-language search term. */
function levelWord(p: LangPack, level?: CefrLevel | null): string {
  if (!level || level === 'A1' || level === 'A2') return p.lvl.beg
  if (level === 'B1' || level === 'B2') return p.lvl.int
  return p.lvl.adv
}

/** Search options that bias results to the target language's own content. */
function langSearchOpts(lang: string): YtSearchOpts {
  const region = pack(lang).region
  return { relevanceLanguage: lang, ...(region ? { regionCode: region } : {}) }
}

export interface VideoCategoryResult {
  key: VideoCategory
  label: string
  blurb: string
  items: IVideoItem[]
}

// Cache reads return Mongoose subdocuments, which CANNOT cross a Server→Client
// boundary (Next.js recurses forever serializing them → "Maximum call stack size
// exceeded"). Strip every cached item down to a plain object before returning.
function plainItem(i: IVideoItem): IVideoItem {
  return {
    videoId: i.videoId,
    title: decodeEntities(i.title),
    channelTitle: decodeEntities(i.channelTitle),
    description: decodeEntities(i.description || ''),
    thumbnail: i.thumbnail,
    publishedAt: i.publishedAt,
    duration: i.duration,
  }
}
function plainItems(items: IVideoItem[] | undefined | null): IVideoItem[] {
  return (items || []).map(plainItem)
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" }
/**
 * search.list returns HTML-escaped snippets (`d&#39;être`, `&quot;`); decode so
 * titles display as written. Also applied when rendering older cached rows.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[\da-f]+|amp|quot|lt|gt|apos);/gi, (m, e: string) => {
    if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

// Fisher–Yates shuffle (returns a new array) — used to vary the Shorts feed.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface YtSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    description?: string
    publishedAt?: string
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } }
  }
}

interface YtSearchOpts {
  maxResults?: number
  videoDuration?: 'short' | 'medium' | 'long'
  // Bias results to the TARGET language's content (not English videos *about* it).
  relevanceLanguage?: string
  regionCode?: string
}

// One page of search results + the cursor to the next page (for infinite scroll).
async function ytSearchPage(
  query: string,
  key: string,
  opts: YtSearchOpts = {},
  pageToken?: string
): Promise<{ items: IVideoItem[]; nextPageToken?: string }> {
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(opts.maxResults ?? PER_CATEGORY))
  url.searchParams.set('order', 'relevance')
  url.searchParams.set('safeSearch', 'moderate')
  url.searchParams.set('videoEmbeddable', 'true')
  if (opts.videoDuration) url.searchParams.set('videoDuration', opts.videoDuration)
  if (opts.relevanceLanguage) url.searchParams.set('relevanceLanguage', opts.relevanceLanguage)
  if (opts.regionCode) url.searchParams.set('regionCode', opts.regionCode)
  if (pageToken) url.searchParams.set('pageToken', pageToken)
  url.searchParams.set('q', query)
  url.searchParams.set('key', key)

  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    let reason = ''
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || '' } catch { /* ignore */ }
    throw new Error(`YouTube HTTP ${res.status} ${reason}`.trim())
  }
  const data = await res.json()
  const raw: YtSearchItem[] = data.items || []
  const items = raw
    .filter((i) => i.id?.videoId)
    .map((i) => ({
      videoId: i.id!.videoId!,
      title: decodeEntities(i.snippet?.title || ''),
      channelTitle: decodeEntities(i.snippet?.channelTitle || ''),
      description: decodeEntities(i.snippet?.description || ''),
      thumbnail: i.snippet?.thumbnails?.medium?.url || i.snippet?.thumbnails?.high?.url || '',
      publishedAt: i.snippet?.publishedAt,
    }))
  return { items, nextPageToken: data.nextPageToken }
}

async function ytSearch(query: string, key: string, opts: YtSearchOpts = {}): Promise<IVideoItem[]> {
  return (await ytSearchPage(query, key, opts)).items
}

// --- Generic search cache (every YouTube call is cached here) ---------------

const SEARCH_TTL_MS = (parseInt(process.env.YT_CACHE_TTL_HOURS || '72', 10) || 72) * 3600 * 1000

async function cacheGet(cacheKey: string): Promise<{ items: IVideoItem[]; nextPageToken?: string } | null> {
  await connectDB()
  const hit = await YtSearchCache.findOne({ cacheKey }).lean()
  if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < SEARCH_TTL_MS) {
    return { items: plainItems(hit.items), nextPageToken: hit.nextPageToken || undefined }
  }
  return null
}

async function cacheSet(cacheKey: string, items: IVideoItem[], nextPageToken?: string) {
  await connectDB()
  await YtSearchCache.findOneAndUpdate(
    { cacheKey },
    { $set: { items, nextPageToken: nextPageToken ?? null, fetchedAt: new Date() } },
    { upsert: true }
  )
}

// --- Quota guard ------------------------------------------------------------
// YouTube exposes no "remaining quota" endpoint, so we infer exhaustion from a
// 403 and stop calling for a cooldown. This both (a) lets us fall back to cached
// content and (b) avoids repeatedly hitting a dead API (every failed call is
// latency = lag). The flag is per-process; cached results cover other instances.
let quotaBlockedUntil = 0
const QUOTA_COOLDOWN_MS = (parseInt(process.env.YT_QUOTA_COOLDOWN_MIN || '60', 10) || 60) * 60 * 1000
function quotaAvailable(): boolean {
  return Date.now() >= quotaBlockedUntil
}
function markQuotaExhausted(): void {
  quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS
}
function isQuotaError(e: unknown): boolean {
  // ONLY the real daily-quota reasons — NOT every 403. A transient rate-limit
  // 403 must not block the (working) API for the whole cooldown.
  const msg = e instanceof Error ? e.message : String(e)
  return /quotaExceeded|dailyLimitExceeded/i.test(msg)
}

/** A cached search page (used by For-You). One paid call per (query,page) per TTL. */
async function cachedSearchPage(
  query: string,
  key: string,
  opts: YtSearchOpts = {},
  pageToken?: string,
  refresh = false
): Promise<{ items: IVideoItem[]; nextPageToken?: string }> {
  const cacheKey = `search:${JSON.stringify({ q: query, d: opts.videoDuration || '', m: opts.maxResults || PER_CATEGORY, rl: opts.relevanceLanguage || '', rc: opts.regionCode || '', p: pageToken || '' })}`
  if (!refresh) {
    const hit = await cacheGet(cacheKey)
    if (hit) return hit
  }
  // Out of quota → don't make a doomed call; serve nothing (caller falls back).
  if (!quotaAvailable()) return { items: [], nextPageToken: undefined }
  const page = await ytSearchPage(query, key, opts, pageToken)
  await cacheSet(cacheKey, page.items, page.nextPageToken)
  return page
}

// --- Shorts query variety (level- + culture-aware) -------------------------

/**
 * Rotating Shorts queries — all in the TARGET LANGUAGE (immersion, slang,
 * expressions, culture, vlogs). Native terms + relevanceLanguage make results
 * actual in-language content, not English videos about the language. A level-
 * tuned native query leads (e.g. "français pour débutants"); variant 0 is the
 * primary feed, the rest cycle in as the user scrolls.
 */
function shortsVariants(langCode: string, level?: CefrLevel | null): string[] {
  const p = pack(langCode)
  const lw = levelWord(p, level)
  // Append the learner's CEFR level (native term) so every variant matches their
  // current French rating — e.g. "#shorts expressions françaises intermédiaire".
  return p.shorts.map((q) => `#shorts ${q} ${lw}`)
}

/** Fun / immersion Shorts queries (no level word). Empty when the pack has none. */
function funShortsVariants(langCode: string): string[] {
  return (pack(langCode).shortsFun || []).map((q) => `#shorts ${q}`)
}

/**
 * What the Shorts feed shows: `learn` (lessons, expressions…), `fun` (cartoons,
 * comedy, challenges…) or `mix` (both, interleaved clip by clip — the default).
 */
export type ShortsMode = 'mix' | 'fun' | 'learn'

export function parseShortsMode(v?: string | null): ShortsMode {
  return v === 'fun' || v === 'learn' ? v : 'mix'
}

/** Variant count for a mode (the client cycles variant 0…count-1). */
function variantCount(lang: string, level: CefrLevel | null | undefined, mode: ShortsMode): number {
  const learn = shortsVariants(lang, level).length
  const fun = funShortsVariants(lang).length
  if (mode === 'fun') return fun || learn
  if (mode === 'learn' || !fun) return learn
  return Math.max(learn, fun)
}

// Mix-mode cursor: one page token per half, "learn|fun". "-" = that half ran out.
const DONE = '-'

/**
 * One batch for variant `idx` in `mode`. Mix pairs learn variant idx with fun
 * variant idx and interleaves the two batches, so the feed alternates lessons
 * and fun clips instead of arriving in blocks of 50 of one kind.
 */
async function fetchModeBatch(
  lang: string,
  level: CefrLevel | null | undefined,
  mode: ShortsMode,
  idx: number,
  key: string,
  token?: string,
  refresh = false
): Promise<{ items: IVideoItem[]; nextPageToken?: string }> {
  const learn = shortsVariants(lang, level)
  const fun = funShortsVariants(lang)
  if (mode === 'learn' || !fun.length) return fetchShortsBatch(learn[idx % learn.length], key, lang, token, refresh)
  if (mode === 'fun') return fetchShortsBatch(fun[idx % fun.length], key, lang, token, refresh)

  const [ta, tb] = (token || '|').split('|')
  const half = (q: string, t: string) =>
    t === DONE ? Promise.resolve({ items: [] as IVideoItem[], nextPageToken: undefined }) : fetchShortsBatch(q, key, lang, t || undefined, refresh)
  const [a, b] = await Promise.all([half(learn[idx % learn.length], ta), half(fun[idx % fun.length], tb)])
  const next = [a.nextPageToken || DONE, b.nextPageToken || DONE]
  return {
    items: interleave([a.items, b.items]),
    nextPageToken: next[0] === DONE && next[1] === DONE ? undefined : next.join('|'),
  }
}

// One shorts "call" gathers up to this many shorts and caches them. We use a
// SINGLE search page (50, the API max) per call — light on quota and avoids the
// rapid back-to-back calls that trip YouTube's short-term rate limit. The client
// loads the next batch as you scroll near the end, so the feed keeps flowing.
const SHORTS_BATCH_TARGET = 50
const SHORTS_PAGES_PER_BATCH = 1

/**
 * Fetch + duration-filter a BATCH of up to ~100 shorts across a couple of search
 * pages, fully cached under (query, startToken) so it's 0 calls on a hit.
 * Returns the cursor after the last consumed page for the next batch.
 *
 * NOTE: we deliberately DON'T probe youtube.com/shorts/<id> to confirm a video
 * is a "true" vertical Short — server-side that hits YouTube's consent redirect
 * and filters out the whole feed (Shorts then never load). The `#shorts`/native
 * query + videoDuration=short + ≤180s duration is reliable and keeps it loading.
 */
async function fetchShortsBatch(
  query: string,
  key: string,
  lang: string,
  startToken?: string,
  refresh = false
): Promise<{ items: IVideoItem[]; nextPageToken?: string }> {
  const cacheKey = `shortsBatch:${JSON.stringify({ q: query, l: lang, p: startToken || '' })}`
  if (!refresh) {
    const hit = await cacheGet(cacheKey)
    if (hit) return hit
  }
  const searchOpts: YtSearchOpts = { videoDuration: 'short', maxResults: 50, ...langSearchOpts(lang) }
  let token = startToken
  const seen = new Set<string>()
  const collected: IVideoItem[] = []
  for (let p = 0; p < SHORTS_PAGES_PER_BATCH; p++) {
    const page = await ytSearchPage(query, key, searchOpts, token)
    const fresh = page.items.filter((i) => !seen.has(i.videoId))
    fresh.forEach((i) => seen.add(i.videoId))
    const durations = await fetchDurations(fresh.map((i) => i.videoId), key)
    const byDuration = fresh
      .map((i) => ({ ...i, duration: durations[i.videoId] }))
      .filter((i) => {
        const secs = iso8601ToSeconds(i.duration)
        return secs > 0 && secs <= SHORT_MAX_SECONDS
      })
    collected.push(...byDuration)
    token = page.nextPageToken
    if (!token || collected.length >= SHORTS_BATCH_TARGET) break
  }
  const items = plainItems(collected.slice(0, SHORTS_BATCH_TARGET))
  await cacheSet(cacheKey, items, token)
  return { items, nextPageToken: token }
}

// --- Cached Shorts (the database supplements every Shorts batch) ------------

/**
 * Titles/channels that mark a clip as a LESSON rather than entertainment. Used
 * to sort cached clips into the Fun / Learn modes (the cache doesn't record
 * which search found a clip). Multilingual: fr / es / de / it / en terms.
 */
const LEARN_HINT =
  /apprend|le[cç]on|cours\b|grammaire|vocabulaire|expressions?\b|prononc|conjug|verbes?\b|dict[ée]e|niveau|d[ée]butant|\bfle\b|argot|comment (dit|dire)|learn|lesson|\bfrench\b|vocab|slang|grammar|pronunciation|aprend|lecci[oó]n|gram[aá]tica|vocabulario|deutsch lernen|wortschatz|grammatik|imparare|lezione|grammatica/i

type CachedShort = IVideoItem & { kind: 'learn' | 'fun' }

// English filler words. A "fun" clip whose title has several of these is an
// English original (e.g. MrBeast's own uploads, which the cache picked up via
// "MrBeast en français") — likely English audio, so it's no immersion.
const ENGLISH_WORDS = /\b(the|you|your|and|with|for|this|that|i|my|is|are|of|to|in|on|vs|how|what|who|world'?s?|every|first|last|can)\b/gi
const looksEnglish = (title: string) => (title.match(ENGLISH_WORDS)?.length ?? 0) >= 2

const SHORTS_POOL_TTL_MS = 10 * 60 * 1000
const shortsPoolMemo = new Map<string, { at: number; items: CachedShort[] }>()

/**
 * Every short clip already in the database for `lang`: VideoDocs indexed as
 * shorts (from past Shorts searches) plus `#shorts` uploads from the curated
 * channels. Slim fields only, memoized for a few minutes — no network calls.
 */
async function cachedShortsPool(lang: string): Promise<CachedShort[]> {
  const memo = shortsPoolMemo.get(lang)
  if (memo && Date.now() - memo.at < SHORTS_POOL_TTL_MS) return memo.items
  await connectDB()
  const blocked = new Set(blockedChannels(lang))
  const docs = await VideoDoc.find({ languageCode: lang, $or: [{ isShort: true }, { title: /#shorts?\b/i }] })
    .select('videoId title channelTitle thumbnail')
    .lean()
  const items: CachedShort[] = docs
    .filter((d) => d.title && !blocked.has(d.channelTitle))
    .map((d): CachedShort => {
      const title = decodeEntities(d.title)
      const channelTitle = decodeEntities(d.channelTitle || '')
      return {
        videoId: d.videoId, title, channelTitle, description: '', thumbnail: d.thumbnail,
        kind: LEARN_HINT.test(`${title} ${channelTitle}`) ? 'learn' : 'fun',
      }
    })
    // Lessons explained in English are still useful; English entertainment isn't immersion.
    .filter((i) => lang === 'en' || i.kind === 'learn' || !looksEnglish(i.title))
  shortsPoolMemo.set(lang, { at: Date.now(), items })
  return items
}

/**
 * Unwatched cached Shorts for `mode`, shuffled. Mix alternates learn/fun. Used
 * to supplement every fresh batch and as the whole feed when the API is out.
 */
export async function getCachedUnseenShorts(
  lang: string,
  exclude: Set<string>,
  limit = SHORTS_BATCH_TARGET,
  mode: ShortsMode = 'mix'
): Promise<IVideoItem[]> {
  const pool = (await cachedShortsPool(lang)).filter((i) => !exclude.has(i.videoId))
  const plain = (list: CachedShort[]): IVideoItem[] =>
    list.map((i) => ({ videoId: i.videoId, title: i.title, channelTitle: i.channelTitle, description: '', thumbnail: i.thumbnail }))
  if (mode !== 'mix') return plain(shuffle(pool.filter((i) => i.kind === mode)).slice(0, limit))
  const learn = shuffle(pool.filter((i) => i.kind === 'learn'))
  const fun = shuffle(pool.filter((i) => i.kind === 'fun'))
  return plain(interleave([learn, fun]) as CachedShort[]).slice(0, limit)
}

/** Clips from the cache blended into each fresh batch (1 cached : 1 fresh). */
const CACHED_PER_BATCH = 30

/** Interleave a fresh API batch with unwatched cached clips (no duplicates). */
async function withCached(fresh: IVideoItem[], lang: string, exclude: Set<string>, mode: ShortsMode): Promise<IVideoItem[]> {
  const skip = new Set([...exclude, ...fresh.map((i) => i.videoId)])
  const cached = await getCachedUnseenShorts(lang, skip, CACHED_PER_BATCH, mode).catch(() => [])
  return interleave([fresh, cached])
}

export const SHORTS_VARIANT_COUNT = 10

// Parse an ISO-8601 duration (e.g. "PT1M30S", "PT58S") into total seconds.
function iso8601ToSeconds(iso?: string): number {
  if (!iso) return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  const [, h, mi, s] = m
  return (parseInt(h || '0', 10) * 3600) + (parseInt(mi || '0', 10) * 60) + parseInt(s || '0', 10)
}

// YouTube Shorts are vertical clips, historically ≤60s and now ≤3min. The API
// has no "shorts" filter, so we search short videos and keep the brief ones.
const SHORT_MAX_SECONDS = 180

/** Hydrate contentDetails.duration for a batch of video IDs (one API call). */
async function fetchDurations(ids: string[], key: string): Promise<Record<string, string>> {
  if (!ids.length) return {}
  const url = new URL('https://www.googleapis.com/youtube/v3/videos')
  url.searchParams.set('part', 'contentDetails')
  url.searchParams.set('id', ids.join(','))
  url.searchParams.set('key', key)
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    let reason = ''
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || '' } catch { /* ignore */ }
    throw new Error(`YouTube HTTP ${res.status} ${reason}`.trim())
  }
  const data = await res.json()
  const out: Record<string, string> = {}
  for (const it of (data.items || []) as Array<{ id?: string; contentDetails?: { duration?: string } }>) {
    if (it.id) out[it.id] = it.contentDetails?.duration || ''
  }
  return out
}

/**
 * Primary Shorts feed for `lang` at the learner's `level`. FRESH EVERY LOAD: we
 * start from a RANDOM query variant and shuffle the page, so each visit surfaces
 * a different slice (still cache-backed per variant, so it stays cheap). Returns
 * the chosen `variant` + page cursor so the client's infinite scroll continues
 * paginating the SAME variant's query, and indexes the clips (isShort) so the
 * profile learns from shorts too.
 */
export async function getShorts(
  lang: string,
  level?: CefrLevel | null,
  opts: { excludeIds?: Set<string>; mode?: ShortsMode } = {}
): Promise<{ available: boolean; items: IVideoItem[]; nextPageToken?: string; variant: number }> {
  const key = process.env.YOUTUBE_API_KEY
  const mode = opts.mode ?? 'mix'
  // Random starting variant → a different feed each page load.
  const variant = Math.floor(Math.random() * variantCount(lang, level, mode))
  const exclude = opts.excludeIds ?? new Set<string>()

  if (key && quotaAvailable()) {
    try {
      const { items, nextPageToken } = await fetchModeBatch(lang, level, mode, variant, key)
      upsertVideoDocs(items, lang, true).catch(() => {})
      const unseen = items.filter((i) => !exclude.has(i.videoId))
      const list = unseen.length ? unseen : items
      // Mix keeps its learn/fun alternation; single modes shuffle the batch.
      // Either way the database cache is woven in, so the feed is never just
      // one search's results.
      if (list.length) {
        const items = await withCached(mode === 'mix' ? list : shuffle(list), lang, exclude, mode)
        return { available: true, items, nextPageToken, variant }
      }
    } catch (e) {
      if (isQuotaError(e)) markQuotaExhausted()
    }
  }
  // No key / out of quota / nothing returned → the cache alone carries the feed.
  const cached = await getCachedUnseenShorts(lang, exclude, SHORTS_BATCH_TARGET, mode)
  return { available: Boolean(key) || cached.length > 0, items: cached, nextPageToken: undefined, variant }
}

export interface MoreShortsOpts {
  variant?: number
  pageToken?: string
  level?: CefrLevel | null
  refresh?: boolean
  excludeIds?: Set<string>
  mode?: ShortsMode
}

/**
 * Next batch of shorts for infinite scroll (up to ~100, cached). Cycles through
 * the level-aware query variants (caller advances `variant` when one runs out of
 * pages) and paginates within a variant via `pageToken`. Falls back to cached,
 * unseen shorts when the API is unavailable.
 */
export async function getMoreShorts(
  lang: string,
  opts: MoreShortsOpts = {}
): Promise<{ items: IVideoItem[]; nextPageToken?: string; variantCount: number }> {
  const key = process.env.YOUTUBE_API_KEY
  const mode = opts.mode ?? 'mix'
  const count = variantCount(lang, opts.level, mode)
  const exclude = opts.excludeIds ?? new Set<string>()
  const idx = (((opts.variant ?? 0) % count) + count) % count

  if (key && quotaAvailable()) {
    try {
      const { items, nextPageToken } = await fetchModeBatch(lang, opts.level, mode, idx, key, opts.pageToken, opts.refresh)
      upsertVideoDocs(items, lang, true).catch(() => {})
      const unseen = items.filter((i) => !exclude.has(i.videoId))
      const blended = await withCached(unseen.length ? unseen : items, lang, exclude, mode)
      return { items: blended, nextPageToken, variantCount: count }
    } catch (e) {
      if (isQuotaError(e)) markQuotaExhausted()
    }
  }
  const cached = await getCachedUnseenShorts(lang, exclude, SHORTS_BATCH_TARGET, mode)
  return { items: cached, nextPageToken: undefined, variantCount: count }
}

/**
 * Profile-driven "For You" search: builds a query from the learner's top
 * interest tags + level, fetches (cached) matching videos, and returns plain
 * items. Caller indexes + ranks them.
 */
export async function searchForYou(
  lang: string,
  tags: string[],
  level?: CefrLevel | null,
  refresh = false
): Promise<IVideoItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []
  const p = pack(lang)
  const topic = tags.slice(0, 3).join(' ')
  // Native-language query at the learner's level so results are in-language AND
  // match their French rating, biased further by relevanceLanguage/regionCode.
  const query = `${p.native} ${levelWord(p, level)} ${topic}`.replace(/\s+/g, ' ').trim()
  try {
    const { items } = await cachedSearchPage(query, key, { maxResults: 20, ...langSearchOpts(lang) }, undefined, refresh)
    return items
  } catch (e) {
    if (isQuotaError(e)) markQuotaExhausted()
    return []
  }
}

/**
 * "Recommended" videos for the watch page. YouTube removed the related-videos
 * API, so we reuse the already-cached curated feed for the language (no extra
 * quota), drop the current video, and shuffle for variety.
 */
export async function getRecommendations(lang: string, excludeVideoId?: string): Promise<IVideoItem[]> {
  const { categories } = await getLearningVideos(lang)
  const seen = new Set<string>()
  const pool: IVideoItem[] = []
  for (const cat of categories) {
    for (const v of cat.items) {
      if (v.videoId === excludeVideoId || seen.has(v.videoId)) continue
      seen.add(v.videoId)
      pool.push(v)
    }
  }
  // Fisher–Yates shuffle, then cap.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 12)
}

/**
 * Metadata for a single video, sourced from the ONE canonical store (`VideoDoc`)
 * so likes/comments/save-to-deck — all keyed on `videoId` — never end up split
 * across two metadata copies. Resolution order:
 *   1) VideoDoc (canonical DB index) — the single source of truth.
 *   2) Any cached search page (VideoCache) — and we HEAL it into VideoDoc.
 *   3) One YouTube snippet lookup — and we index it so we never pay again.
 */
export async function getVideoMeta(videoId: string, lang: string): Promise<IVideoItem | null> {
  await connectDB()

  // 1) Canonical index first.
  const doc = await VideoDoc.findOne({ videoId }).lean()
  if (doc) {
    return { videoId, title: doc.title, channelTitle: doc.channelTitle, description: doc.description, thumbnail: doc.thumbnail }
  }

  // 2) Fall back to any cached feed/search page — then backfill the canonical
  //    store so the next lookup (and every engagement feature) hits one copy.
  const caches = await VideoCache.find({ languageCode: lang })
  for (const c of caches) {
    const hit = c.items.find((i) => i.videoId === videoId)
    if (hit) {
      const item = plainItem(hit)
      await upsertVideoDocs([item], lang)
      return item
    }
  }

  // 3) Last resort: one snippet lookup, then index it.
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('id', videoId)
    url.searchParams.set('key', key)
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`)
    const data = await res.json()
    const it = (data.items || [])[0] as YtSearchItem | undefined
    if (!it) return null
    const item: IVideoItem = {
      videoId,
      title: it.snippet?.title || '',
      channelTitle: it.snippet?.channelTitle || '',
      description: it.snippet?.description || '',
      thumbnail: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.high?.url || '',
      publishedAt: it.snippet?.publishedAt,
    }
    await upsertVideoDocs([item], lang)
    return item
  } catch {
    return null
  }
}

/**
 * Round-robin interleave several lists into one, deduped by videoId, so every
 * source surfaces near the top instead of one dominating. Order of `lists`
 * decides who leads each round.
 */
function interleave(lists: IVideoItem[][]): IVideoItem[] {
  const merged: IVideoItem[] = []
  const seen = new Set<string>()
  const longest = lists.reduce((m, l) => Math.max(m, l.length), 0)
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i]
      if (item && !seen.has(item.videoId)) {
        seen.add(item.videoId)
        merged.push(item)
      }
    }
  }
  return merged
}

/**
 * Build the Casual & immersion feed from a MIX of content-type queries
 * (cartoons, podcasts, shows, interviews, films). Pulls a handful from each in
 * parallel, then round-robin interleaves so every type surfaces near the top
 * instead of one type dominating. Per-query failures are isolated (and quota
 * errors recorded) so one dud query never sinks the whole row.
 *
 * Cost: ~one search.list (100 units) per query, but only when the casual cache
 * is stale (7-day TTL), so it refreshes at most once a week per language.
 */
async function fetchCasualMix(queries: string[], key: string, lang: string): Promise<IVideoItem[]> {
  const perQuery = Math.max(4, Math.ceil((PER_CATEGORY * 3) / queries.length))
  const opts: YtSearchOpts = { maxResults: perQuery, ...langSearchOpts(lang) }
  const lists = await Promise.all(
    queries.map(async (q) => {
      try {
        return await ytSearch(q, key, opts)
      } catch (e) {
        if (isQuotaError(e)) markQuotaExhausted()
        return []
      }
    })
  )
  return interleave(lists)
}

// --- Channel uploads (curated immersion channels) ---------------------------
// playlistItems entries for private/deleted videos carry these placeholder
// titles and no usable thumbnail — drop them.
const DEAD_VIDEO_TITLES = new Set(['Private video', 'Deleted video'])

// Resolved handle → uploads-playlist id. Per-process cache so we pay the
// channels.list (1 unit) lookup at most once per channel per process.
const uploadsPlaylistCache = new Map<string, string>()

interface YtPlaylistItem {
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    publishedAt?: string
    resourceId?: { videoId?: string }
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } }
  }
}

/** Resolve a channel HANDLE (no leading @) to its uploads-playlist id. */
async function resolveUploadsPlaylist(handle: string, key: string): Promise<string | null> {
  const h = handle.replace(/^@/, '')
  const cached = uploadsPlaylistCache.get(h)
  if (cached) return cached
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'contentDetails')
  url.searchParams.set('forHandle', h)
  url.searchParams.set('key', key)
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    let reason = ''
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || '' } catch { /* ignore */ }
    throw new Error(`YouTube HTTP ${res.status} ${reason}`.trim())
  }
  const data = await res.json()
  const uploads: string | undefined = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (uploads) uploadsPlaylistCache.set(h, uploads)
  return uploads || null
}

/** Recent uploads from one channel handle, as feed items. */
async function fetchChannelUploads(handle: string, key: string, max = 10): Promise<IVideoItem[]> {
  const uploads = await resolveUploadsPlaylist(handle, key)
  if (!uploads) return []
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('maxResults', String(max))
  url.searchParams.set('playlistId', uploads)
  url.searchParams.set('key', key)
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    let reason = ''
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || '' } catch { /* ignore */ }
    throw new Error(`YouTube HTTP ${res.status} ${reason}`.trim())
  }
  const data = await res.json()
  return ((data.items || []) as YtPlaylistItem[])
    .map((it): IVideoItem | null => {
      const sn = it.snippet
      const vid = sn?.resourceId?.videoId
      if (!vid || !sn?.title || DEAD_VIDEO_TITLES.has(sn.title)) return null
      return {
        videoId: vid,
        title: sn.title,
        channelTitle: sn.channelTitle || '',
        description: sn.description || '',
        thumbnail: sn.thumbnails?.medium?.url || sn.thumbnails?.high?.url || '',
        publishedAt: sn.publishedAt,
      }
    })
    .filter((i): i is IVideoItem => i !== null)
}

/**
 * Pull recent uploads from each curated immersion channel (in parallel) and
 * round-robin interleave them, so the casual row opens with a varied spread of
 * channels rather than one channel's back-catalogue. Per-channel failures are
 * isolated (and quota errors recorded) so one dead handle never sinks the row.
 *
 * Cost: ~2 units per channel (channels.list + playlistItems.list) plus 1 per
 * 50 videos for localized titles, and only on
 * a casual cache miss (7-day TTL) — a few dozen units a week per language.
 */
/**
 * Swap in each video's title/description in `lang` where the creator provides
 * one (e.g. MrBeast's French titles for his dubbed uploads) — playlistItems
 * only returns the originals. Batched videos.list: 1 unit per 50 videos.
 * Best-effort: on any error the items come back unchanged.
 */
async function localizeTitles(items: IVideoItem[], key: string, lang: string): Promise<IVideoItem[]> {
  const localized = new Map<string, { title?: string; description?: string }>()
  for (let i = 0; i < items.length; i += 50) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('id', items.slice(i, i + 50).map((v) => v.videoId).join(','))
    url.searchParams.set('hl', lang)
    url.searchParams.set('key', key)
    try {
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) continue
      const data = await res.json()
      for (const v of data.items || []) if (v.snippet?.localized) localized.set(v.id, v.snippet.localized)
    } catch { /* keep originals */ }
  }
  return items.map((v) => {
    const l = localized.get(v.videoId)
    return l?.title ? { ...v, title: l.title, description: l.description || v.description } : v
  })
}

/**
 * Uploads from English-original channels with dubbed audio (LangPack.dubbedChannels),
 * keeping only videos whose title is localized into `lang` — i.e. ones that
 * actually carry a dub. Pulls 25 per channel to have enough after filtering.
 */
async function fetchDubbedChannels(handles: string[], key: string, lang: string): Promise<IVideoItem[]> {
  const lists = await Promise.all(
    handles.map(async (h) => {
      try {
        const items = await fetchChannelUploads(h, key, 25)
        const original = new Map(items.map((i) => [i.videoId, i.title]))
        return (await localizeTitles(items, key, lang)).filter((i) => i.title !== original.get(i.videoId))
      } catch (e) {
        if (isQuotaError(e)) markQuotaExhausted()
        return []
      }
    })
  )
  return interleave(lists)
}

async function fetchCasualChannels(handles: string[], key: string, lang: string): Promise<IVideoItem[]> {
  const lists = await Promise.all(
    handles.map(async (h) => {
      try {
        return await fetchChannelUploads(h, key)
      } catch (e) {
        if (isQuotaError(e)) markQuotaExhausted()
        return []
      }
    })
  )
  return localizeTitles(interleave(lists), key, lang)
}

/**
 * The full Casual & immersion feed: lead with curated channel uploads (cartoons
 * etc.), then top up with the content-type search mix. Falls back to a single
 * casual search when neither source is configured.
 */
async function fetchCasual(p: LangPack, key: string, lang: string): Promise<IVideoItem[]> {
  const lists: IVideoItem[][] = []
  if (p.casualChannels?.length) {
    const ch = await fetchCasualChannels(p.casualChannels, key, lang)
    if (ch.length) lists.push(ch)
  }
  if (p.dubbedChannels?.length) {
    const dub = await fetchDubbedChannels(p.dubbedChannels, key, lang)
    if (dub.length) lists.push(dub)
  }
  if (p.casualMix?.length) {
    const mix = await fetchCasualMix(p.casualMix, key, lang)
    if (mix.length) lists.push(mix)
  }
  if (!lists.length) return ytSearch(p.categories.casual, key, { maxResults: 25, ...langSearchOpts(lang) })
  return interleave(lists)
}

/** The assembled curated feed per language, kept in memory briefly (it's read on every /videos view). */
const FEED_MEMO_MS = 5 * 60 * 1000
const feedMemo = new Map<string, { at: number; value: { available: boolean; categories: VideoCategoryResult[] } }>()

/**
 * Returns the curated video feed for `lang`. `available` is false when no
 * YOUTUBE_API_KEY is configured (the UI then shows a graceful empty state),
 * though any previously cached results are still served.
 *
 * One lean query reads every cached category; stale ones refetch in parallel.
 * Videos are indexed into VideoDoc only when a category is actually refetched
 * (indexing ~400 docs on every view used to swamp the DB connection pool).
 */
export async function getLearningVideos(lang: string): Promise<{ available: boolean; categories: VideoCategoryResult[] }> {
  const memo = feedMemo.get(lang)
  if (memo && Date.now() - memo.at < FEED_MEMO_MS) return memo.value

  await connectDB()
  const key = process.env.YOUTUBE_API_KEY
  const p = pack(lang)
  const now = Date.now()
  const rows = await VideoCache.find({ languageCode: lang, category: { $in: CATEGORIES.map((c) => c.key) } }).lean()
  const byKey = new Map(rows.map((r) => [r.category, r]))

  const categories = await Promise.all(
    CATEGORIES.map(async (def): Promise<VideoCategoryResult> => {
      const cached = byKey.get(def.key)
      const fresh = cached && now - new Date(cached.fetchedAt).getTime() < TTL_MS
      let items: IVideoItem[] = cached?.items || []
      if (!fresh && key && quotaAvailable()) {
        try {
          // Native-language query + relevanceLanguage so the curated feed is in the
          // target language. search.list costs 100 units for 1–50 results, so pull a
          // deep pool (25) for the SAME quota — fresh window on each refresh. Casual
          // instead pulls a mix of content types (cartoons/podcasts/shows/…) so the
          // immersion row plays like browsing TV rather than a single search.
          let fetched =
            def.key === 'casual' && (p.casualChannels?.length || p.dubbedChannels?.length || p.casualMix?.length)
              ? await fetchCasual(p, key, lang)
              : await ytSearch(p.categories[def.key], key, { maxResults: 25, ...langSearchOpts(lang) })
          const blocked = new Set(p.blockedChannels || [])
          if (blocked.size) fetched = fetched.filter((i) => !blocked.has(i.channelTitle))
          if (fetched.length) {
            items = fetched
            await VideoCache.findOneAndUpdate(
              { languageCode: lang, category: def.key },
              { $set: { items: fetched, fetchedAt: new Date() } },
              { upsert: true }
            )
            // Index the new videos into the canonical store so likes/comments/save
            // resolve a single metadata copy regardless of where the video surfaced.
            upsertVideoDocs(plainItems(fetched), lang, false).catch(() => {})
          }
        } catch (e) {
          // Quota/transient error — fall back to whatever is cached.
          if (isQuotaError(e)) markQuotaExhausted()
        }
      }
      return { key: def.key, label: def.label, blurb: def.blurb, items: plainItems(items) }
    })
  )

  const value = { available: Boolean(key), categories }
  feedMemo.set(lang, { at: Date.now(), value })
  return value
}
