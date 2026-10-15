import { connectDB } from '@/lib/db'
import CaptionCache, { type ICaptionCue } from '@/lib/models/CaptionCache'
import { chatJson, langName } from '@/lib/ai'
import { baseCode, parseJson3, asrSentences, keyedLines } from '@/lib/captionsCore'

export { baseCode }

// ---------------------------------------------------------------------------
// Subtitles for the watch page. The IFrame player can only show ONE caption
// track and gives us no access to its text, so for dual (or triple) subtitles
// we fetch the tracks ourselves and render them over the video.
//
// Track list: YouTube's innertube `player` endpoint as the Android client (the
// web client's caption URLs now need a proof-of-origin token). Its baseUrls are
// short-lived, so the list is only cached in memory, never in Mongo.
//
// When a video has no track in a wanted language (typically the learner's
// native one), we translate another track line-by-line with the AI cascade.
// YouTube's own `tlang` auto-translate is aggressively rate-limited (429) from
// servers, so it isn't relied on.
// ---------------------------------------------------------------------------

export interface CaptionTrack {
  code: string        // base ISO code, e.g. 'es' (from 'es-419')
  fullCode: string    // YouTube's code, e.g. 'es-419'
  name: string        // YouTube's label, e.g. 'Spanish (Latin America)'
  auto: boolean       // auto-generated (ASR)
}
interface RawTrack extends CaptionTrack { baseUrl: string }

const ANDROID_VERSION = '20.10.38'
const UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14)`
const LIST_TTL_MS = 30 * 60 * 1000
const MAX_AI_CUES = 2400    // a couple of hours of speech
const AI_PART = 100         // cues translated per request (~5–10 min of video)
const AI_BATCH = 50         // cues per AI call; a part's batches run in parallel

const listCache = new Map<string, { at: number; tracks: RawTrack[] }>()

async function rawTracks(videoId: string): Promise<RawTrack[]> {
  const hit = listCache.get(videoId)
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.tracks
  let tracks: RawTrack[] = []
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: ANDROID_VERSION, androidSdkVersion: 34, hl: 'en' } },
        videoId,
      }),
      cache: 'no-store',
    })
    if (res.ok) {
      const j = await res.json()
      const list = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
      tracks = list
        .filter((t: { baseUrl?: string; languageCode?: string }) => t.baseUrl && t.languageCode)
        .map((t: { baseUrl: string; languageCode: string; kind?: string; name?: { simpleText?: string; runs?: { text: string }[] } }) => ({
          baseUrl: t.baseUrl,
          fullCode: t.languageCode,
          code: baseCode(t.languageCode),
          name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? t.languageCode,
          auto: t.kind === 'asr',
        }))
    }
  } catch (e) {
    console.warn('[captions] track list failed:', (e as Error).message)
  }
  listCache.set(videoId, { at: Date.now(), tracks })
  return tracks
}

/** Caption tracks the video has, one per base language (human tracks win over ASR). */
export async function listTracks(videoId: string): Promise<CaptionTrack[]> {
  const byCode = new Map<string, RawTrack>()
  for (const t of await rawTracks(videoId)) {
    const cur = byCode.get(t.code)
    if (!cur || (cur.auto && !t.auto)) byCode.set(t.code, t)
  }
  return [...byCode.values()].map(({ code, fullCode, name, auto }) => ({ code, fullCode, name, auto }))
}

function pickTrack(tracks: RawTrack[], lang: string): RawTrack | undefined {
  const matches = tracks.filter((t) => t.code === baseCode(lang))
  return matches.find((t) => !t.auto) ?? matches[0]
}

async function fetchTrack(t: RawTrack): Promise<ICaptionCue[]> {
  const url = t.baseUrl.replace(/&fmt=[^&]*/g, '') + '&fmt=json3'
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!res.ok) throw new Error(`caption fetch ${res.status}`)
  const json = await res.json()
  // Auto-generated tracks break lines mid-sentence; regroup them into
  // sentences so they read (and translate) naturally.
  return t.auto ? asrSentences(json) : parseJson3(json)
}

/**
 * Translate cues line-for-line. Lines go out keyed by number and come back
 * matched by key, so a model that merges or drops a line (common with
 * unpunctuated auto-generated captions) can't shift every later line out of
 * sync; lines still missing get one retry. `complete` is false when some
 * lines never came back, so the caller doesn't cache a gappy translation.
 */
async function translateCues(src: ICaptionCue[], from: string, to: string): Promise<{ cues: ICaptionCue[]; complete: boolean }> {
  const fromName = langName(from)
  const toName = langName(to)

  async function run(idx: number[]): Promise<Map<number, string>> {
    const input = Object.fromEntries(idx.map((i) => [String(i), src[i].text]))
    const out = await chatJson<{ lines?: unknown }>([
      {
        role: 'system',
        content:
          `You translate ${fromName} video subtitles into natural ${toName}. You get a JSON object of ` +
          `consecutive subtitle lines keyed by line number (possibly auto-transcribed, so expect missing ` +
          `punctuation and the odd mis-heard word); use the neighbours for context but translate each line ` +
          `on its own — never merge or split lines. Reply as JSON with the SAME keys: {"lines": {"<key>": "...", ...}}.`,
      },
      { role: 'user', content: JSON.stringify(input) },
    ], { temperature: 0.2, maxTokens: 4000 }).catch(() => null)
    return keyedLines(out?.lines, idx)
  }

  const all = src.map((_, i) => i)
  const batches: number[][] = []
  for (let i = 0; i < all.length; i += AI_BATCH) batches.push(all.slice(i, i + AI_BATCH))
  const got = new Map<number, string>()
  for (const m of await Promise.all(batches.map(run))) for (const [k, v] of m) got.set(k, v)

  const missing = all.filter((i) => !got.get(i))
  if (missing.length && missing.length < all.length) {
    for (const [k, v] of await run(missing)) got.set(k, v)
  }
  const cues = src.map((c, i) => ({ ...c, text: got.get(i) ?? '' })).filter((c) => c.text)
  return { cues, complete: cues.length === src.length }
}

export interface CaptionResult {
  cues: ICaptionCue[]
  source: 'youtube' | 'ai'
  from?: string
  /** AI translations arrive in parts so each request stays quick; fetch part+1 until `parts`. */
  part?: number
  parts?: number
}

// Bump when parsing changes so stale cached cues (and translations indexed
// against them) are refetched instead of served. AI rows also need
// MIN_AI_VER: before v3, a model that merged lines shifted the rest of the
// translation out of sync, so those rows are re-translated.
const CACHE_VER = 3
const MIN_OWN_VER = 2
const MIN_AI_VER = 3

async function cacheGet(videoId: string, key: string) {
  const row = await CaptionCache.findOne({ videoId, lang: key }).lean()
  const min = row?.source === 'ai' ? MIN_AI_VER : MIN_OWN_VER
  return row && (row.ver ?? 0) >= min && row.cues?.length ? row : null
}

async function cachePut(videoId: string, key: string, r: CaptionResult) {
  await CaptionCache.updateOne(
    { videoId, lang: key },
    { $set: { cues: r.cues, source: r.source, from: r.from, parts: r.parts, ver: CACHE_VER, fetchedAt: new Date() } },
    { upsert: true },
  ).catch(() => {})
}

/** The video's own track in `code`, human or auto-generated (cached). */
async function ownCaptions(videoId: string, code: string, tracks: RawTrack[]): Promise<CaptionResult | null> {
  const cached = await cacheGet(videoId, code)
  if (cached) return { cues: cached.cues, source: 'youtube' }
  const own = pickTrack(tracks, code)
  if (!own) return null
  try {
    const cues = await fetchTrack(own)
    if (!cues.length) return null
    const r: CaptionResult = { cues, source: 'youtube' }
    await cachePut(videoId, code, r)
    return r
  } catch (e) {
    console.warn('[captions] fetch failed:', (e as Error).message)
    return null
  }
}

/**
 * Cues for `lang`. Uses the video's own track (human or auto-generated) when it
 * has one; otherwise, when `allowAi` permits, translates the track in
 * `preferFrom` (the learner's target language) or failing that whichever
 * exists — one `part` of AI_PART cues per call. Null when nothing works.
 */
export async function getCaptions(
  videoId: string,
  lang: string,
  opts: { part?: number; preferFrom?: string; allowAi?: () => Promise<boolean> } = {},
): Promise<CaptionResult | null> {
  const code = baseCode(lang)
  await connectDB()
  const tracks = await rawTracks(videoId)
  const own = await ownCaptions(videoId, code, tracks)
  if (own || !tracks.length) return own

  const part = Math.max(0, Math.floor(opts.part ?? 0))
  const key = `${code}#${part}`
  const cached = await cacheGet(videoId, key)
  if (cached) return { cues: cached.cues, source: 'ai', from: cached.from, part, parts: cached.parts }

  const base = (opts.preferFrom && pickTrack(tracks, opts.preferFrom)) || tracks.find((t) => !t.auto) || tracks[0]
  const baseCues = await ownCaptions(videoId, base.code, tracks)
  if (!baseCues) return null
  const src = baseCues.cues.slice(0, MAX_AI_CUES)
  const parts = Math.ceil(src.length / AI_PART)
  if (part >= parts) return null
  if (!opts.allowAi || !(await opts.allowAi())) return null

  try {
    const { cues, complete } = await translateCues(src.slice(part * AI_PART, (part + 1) * AI_PART), base.code, code)
    if (!cues.length) return null
    const r: CaptionResult = { cues, source: 'ai', from: base.code, part, parts }
    // A part with lines missing is still shown, but not cached for everyone —
    // the next viewer gets a fresh attempt at a complete one.
    if (complete) await cachePut(videoId, key, r)
    return r
  } catch (e) {
    console.warn('[captions] AI translation failed:', (e as Error).message)
    return null
  }
}

