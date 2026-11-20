import { connectDB } from '@/lib/db'
import CaptionCache, { type ICaptionCue } from '@/lib/models/CaptionCache'
import { baseCode, parseJson3, asrSentences } from '@/lib/captionsCore'

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
// Only the video's own tracks are used: a language the video has no track for simply isn't offered.
// (Machine-translating subtitles with a server-side model was removed: every AI call in the app
// goes through Firebase AI Logic in the browser.)
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

export interface CaptionResult {
  cues: ICaptionCue[]
  source: 'youtube'
}

// Bump when parsing changes so stale cached cues are refetched instead of served.
const CACHE_VER = 3
const MIN_OWN_VER = 2

async function cacheGet(videoId: string, key: string) {
  const row = await CaptionCache.findOne({ videoId, lang: key }).lean()
  return row && (row.ver ?? 0) >= MIN_OWN_VER && row.cues?.length ? row : null
}

async function cachePut(videoId: string, key: string, r: CaptionResult) {
  await CaptionCache.updateOne(
    { videoId, lang: key },
    { $set: { cues: r.cues, source: r.source, ver: CACHE_VER, fetchedAt: new Date() } },
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

/** Cues for `lang` from the video's own track (human or auto-generated). Null when it has none. */
export async function getCaptions(videoId: string, lang: string): Promise<CaptionResult | null> {
  const code = baseCode(lang)
  await connectDB()
  const tracks = await rawTracks(videoId)
  return ownCaptions(videoId, code, tracks)
}
