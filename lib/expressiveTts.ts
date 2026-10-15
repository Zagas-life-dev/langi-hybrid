import { createHash } from 'crypto'
import { connectDB } from '@/lib/db'
import TtsCache from '@/lib/models/TtsCache'
import AiBackendState from '@/lib/models/AiBackendState'
import { geminiKeys, type GeminiKey } from '@/lib/geminiKeys'
import { TTS_STYLE_NAMES, type TtsStyle } from '@/lib/ttsStyles'
import { cloudinaryConfigured, uploadAudio } from '@/lib/audioStore'
import { voiceFor, generateLocal, localTtsUrl, baseLang } from '@/lib/localTts'

export type { TtsStyle }

// ---------------------------------------------------------------------------
// Expressive speech via Gemini TTS.
//
// WHY THIS EXISTS: the browser's Web Speech API (lib/speech.ts) cannot do
// emotion. It's flat parametric synthesis — no amount of client code makes it
// sound like a person telling a story. Gemini's TTS models take a natural-
// language style instruction ahead of the text ("read this warmly, like a
// friendly storyteller: ...") and actually perform it, which is what makes a
// graded story or a tutor reply worth listening to.
//
// Verified against the live API on 2026-07-25:
//   * gemini-3.1-flash-tts-preview  -> 200, audio/l16; rate=24000; channels=1
//   * gemini-2.5-pro-preview-tts    -> 429, free-tier quota 0 (needs billing)
// Audio comes back as raw little-endian PCM, so we wrap it in a WAV header
// before sending it to the browser (no <audio> element plays bare PCM).
//
// MODEL CASCADE: the free tier meters each TTS model SEPARATELY — the 429 body
// names the model as a quota dimension ("limit: 10, model: gemini-3.1-flash-tts").
// So when the primary runs dry, a sibling model still has its own untouched
// allowance, and swapping to it buys another full day of audio instead of
// dropping the learner to flat browser speech. Models are tried in order, each
// exhausted one is parked with a persisted cooldown, and only when every model
// is walled does the caller get a TtsRateLimitError (and fall back to the
// browser voice). Mirrors the chat cascade in lib/ai.ts.
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Gemini returns 24 kHz, 16-bit, mono. Parsed from the response, these are fallbacks. */
const DEFAULT_RATE = 24000
const DEFAULT_BITS = 16
const DEFAULT_CHANNELS = 1

/** Hard ceiling per request — the TTS models cap at ~8k input tokens. */
export const MAX_TTS_CHARS = 1200

export class TtsUnavailableError extends Error {}
export class TtsRateLimitError extends Error {}

/**
 * Delivery styles. The key is what the client asks for; the value is the
 * instruction prefixed to the text. These are deliberately written as stage
 * directions rather than adjectives — the models follow "like a friendly
 * teacher leaning in" far better than "friendly".
 */
export const TTS_STYLES: Record<TtsStyle, string> = {
  /** Graded stories — the flagship use case for expressive reading. */
  story: 'Read aloud like a warm, engaging storyteller: unhurried, with natural rises and falls, a small pause at each comma, and real feeling on the emotional beats. Do not sound like a narrator reading a list.',
  /** Grammar lessons and explanations. */
  teacher: 'Read aloud like a patient, encouraging teacher explaining something to one student: clear, calm, slightly slower on the important words, warm but not theatrical.',
  /** Conversation practice / tutor replies. */
  conversational: 'Say this the way a friendly native speaker would in real conversation: relaxed, natural rhythm, light and unforced.',
  /** Single vocabulary items — clarity over character. */
  clear: 'Pronounce this clearly and deliberately, at a measured pace, as a pronunciation model for a language learner.',
  /** Dramatic passages, dialogue in stories. */
  dramatic: 'Perform this with expression and emotion, as an audiobook narrator would: vary the pace and intensity, and let the feeling come through.',
}

export function isTtsStyle(s: string): s is TtsStyle {
  return (TTS_STYLE_NAMES as readonly string[]).includes(s)
}

/** Voices the Gemini TTS models expose. Kore is a neutral, warm default. */
export const TTS_VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
] as const

/**
 * BCP-47 codes the speech config accepts (from the v1beta discovery document).
 * Anything outside this list is sent without a languageCode and left to the
 * model to infer from the text.
 */
const SUPPORTED_LANGS = new Set([
  'de-DE', 'en-AU', 'en-GB', 'en-IN', 'en-US', 'es-US', 'fr-FR', 'hi-IN',
  'pt-BR', 'ar-XA', 'es-ES', 'fr-CA', 'id-ID', 'it-IT', 'ja-JP', 'tr-TR',
  'vi-VN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'ta-IN', 'te-IN',
  'nl-NL', 'ko-KR', 'cmn-CN', 'pl-PL', 'ru-RU', 'th-TH',
])

export function ttsLanguageSupported(tag: string): boolean {
  return SUPPORTED_LANGS.has(tag)
}

function ttsModel(): string {
  return process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'
}

/**
 * Backup models, tried in order after the primary. Each has its own free-tier
 * allowance, so this is real extra capacity, not a retry of the same bucket.
 * 2.5-pro sits last on purpose: its free-tier quota is 0 (billing required), so
 * it only ever helps on a paid key — it costs one fast 429 to find out, then
 * parks itself for the rest of the day.
 */
const DEFAULT_FALLBACK_MODELS = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
]

/**
 * The full cascade, primary first. GEMINI_TTS_MODELS overrides the backups
 * (comma-separated); the primary from GEMINI_TTS_MODEL always leads regardless,
 * because it is what cacheKey() hashes.
 */
export function ttsModelChain(): string[] {
  const configured = (process.env.GEMINI_TTS_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const chain = [ttsModel(), ...(configured.length ? configured : DEFAULT_FALLBACK_MODELS)]
  return [...new Set(chain)]
}

function defaultVoice(): string {
  return process.env.GEMINI_TTS_VOICE || 'Kore'
}

/** True when the server can produce expressive audio at all (cache, local model or Gemini). */
export function expressiveTtsConfigured(): boolean {
  return geminiKeys().length > 0 || Boolean(localTtsUrl()) || cloudinaryConfigured()
}

export interface SpeakRequest {
  text: string
  /** BCP-47 tag, e.g. 'fr-FR'. */
  lang: string
  style: TtsStyle
  voice?: string
}

/**
 * Hashes the PRIMARY model, never the fallback that may end up serving the
 * request — the lookup happens before a model is chosen, so anything else would
 * hide fallback-generated clips from every later request and re-buy them.
 */
/**
 * Cache key for a clip in one of Langi's own designed voices (lib/ttsVoices.ts),
 * or null when the language has none. Keyed by the voice id rather than the
 * style: styles that share a voice share its clips.
 */
export function localCacheKey(req: SpeakRequest): string | null {
  const voice = voiceFor(req.lang, req.style)
  if (!voice) return null
  return createHash('sha256')
    .update(['local', voice.id, baseLang(req.lang), req.text].join('\u0000'))
    .digest('hex')
}

export function cacheKey(req: SpeakRequest): string {
  return createHash('sha256')
    .update([ttsModel(), req.voice || defaultVoice(), req.lang, req.style, req.text].join('\u0000'))
    .digest('hex')
}

/** Wrap raw PCM in a 44-byte RIFF/WAVE header so browsers can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bits: number): Buffer {
  const blockAlign = (channels * bits) / 8
  const byteRate = sampleRate * blockAlign
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4) // file size minus the first 8 bytes
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM fmt chunk size
  header.writeUInt16LE(1, 20) // audio format 1 = PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Speech bitrate for the stored MP3. 80 kbps mono keeps consonants crisp (48
 * softened them audibly) and is still ~5x smaller than the 384 kbps PCM the
 * models return, so caching every clip forever stays affordable. Encoding only
 * happens on the cache-miss path, next to a multi-second generation.
 */
const MP3_KBPS = 80

/**
 * PCM -> MP3. The encoder is a pure-JS build (no native deps, no ffmpeg), so it
 * runs unchanged on Vercel's serverless runtime. Imported dynamically because
 * the package ships an ESM-only usable build.
 */
async function pcmToMp3(pcm: Buffer, sampleRate: number, channels: number): Promise<Buffer> {
  const lame = await import('@breezystack/lamejs')
  const Mp3Encoder = lame.Mp3Encoder ?? (lame as unknown as { default: { Mp3Encoder: typeof lame.Mp3Encoder } }).default?.Mp3Encoder
  if (typeof Mp3Encoder !== 'function') throw new TtsUnavailableError('MP3 encoder unavailable')

  // Reinterpret the byte buffer as signed 16-bit samples without copying.
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2))
  const encoder = new Mp3Encoder(channels, sampleRate, MP3_KBPS)
  const parts: Buffer[] = []
  // 1152 samples is one MPEG-1 Layer III frame; feeding whole frames avoids
  // the encoder buffering partial frames across calls.
  const FRAME = 1152
  for (let i = 0; i < samples.length; i += FRAME) {
    const chunk = encoder.encodeBuffer(samples.subarray(i, Math.min(i + FRAME, samples.length)))
    if (chunk.length) parts.push(Buffer.from(chunk))
  }
  const tail = encoder.flush()
  if (tail.length) parts.push(Buffer.from(tail))
  return Buffer.concat(parts)
}

/** Pull the sample rate / bit depth out of e.g. "audio/l16; rate=24000; channels=1". */
function parsePcmMime(mime: string) {
  const rate = /rate=(\d+)/.exec(mime)?.[1]
  const channels = /channels=(\d+)/.exec(mime)?.[1]
  const bits = /l(\d+)/i.exec(mime)?.[1]
  return {
    sampleRate: rate ? parseInt(rate, 10) : DEFAULT_RATE,
    channels: channels ? parseInt(channels, 10) : DEFAULT_CHANNELS,
    bits: bits ? parseInt(bits, 10) : DEFAULT_BITS,
  }
}

// --- Per-model cooldown ----------------------------------------------------
//
// Shares the AiBackendState collection with the chat cascade (namespaced keys),
// so the back-off survives the serverless restarts that would otherwise reset an
// in-memory counter on every cold start and re-burn the daily allowance.

const COOLDOWN_PREFIX = 'tts:'
/** Floor for a per-minute wall — long enough that a retry isn't instantly re-429'd. */
const MIN_COOLDOWN_MS = 30_000
/** Ceiling for anything that isn't a daily quota, so a bad parse can't park a model for hours. */
const MAX_COOLDOWN_MS = 15 * 60_000
const DEFAULT_COOLDOWN_MS = 60_000

/** Read-through cache so the hot path doesn't hit Mongo for every model. */
const cooldownCache = new Map<string, number>()

async function cooledUntil(model: string): Promise<number> {
  const mem = cooldownCache.get(model) || 0
  if (mem > Date.now()) return mem
  await connectDB()
  const doc = await AiBackendState.findOne({ backend: COOLDOWN_PREFIX + model }).lean()
  const until = doc?.cooldownUntil ? new Date(doc.cooldownUntil).getTime() : 0
  if (until > Date.now()) {
    cooldownCache.set(model, until)
    return until
  }
  return 0
}

async function park(model: string, ms: number, why: string) {
  const until = Date.now() + ms
  cooldownCache.set(model, until)
  try {
    await connectDB()
    await AiBackendState.updateOne(
      { backend: COOLDOWN_PREFIX + model },
      { $set: { cooldownUntil: new Date(until) } },
      { upsert: true }
    )
  } catch (e) {
    // An unwritable cooldown is not worth losing the request over — the
    // in-memory copy still protects this instance.
    console.warn('[tts] cooldown write failed:', (e as Error).message)
  }
  console.warn(`[tts] ${model} parked for ${Math.round(ms / 1000)}s (${why}) — trying next model`)
}

/**
 * How long to park a model that reported a DAILY cap.
 *
 * NOT until midnight, though that is when the free tier's daily counters
 * nominally reset. Measured on 2026-07-26: gemini-3.1-flash-tts-preview
 * returned GenerateRequestsPerDayPerProjectPerModel-FreeTier "limit: 10" and
 * then served a request normally ~3 minutes later — the counter frees up as
 * requests age out rather than holding until a hard reset. Writing a model off
 * for the rest of the day would therefore discard capacity that comes back
 * within minutes. So we re-check periodically instead: if the cap really is
 * spent the retry costs one fast 429 every quarter hour, and the cascade is
 * serving from another model the whole time either way.
 */
const DAILY_COOLDOWN_MS = (parseInt(process.env.TTS_DAILY_COOLDOWN_MIN || '15', 10) || 15) * 60_000

/**
 * A model whose free-tier allowance is 0 (`limit: 0` — gemini-2.5-pro-tts on a
 * key without billing) is not "spent", it is unavailable: the request is
 * rejected at the quota gate and never reaches the model, which is why it also
 * never shows up as usage on the AI Studio dashboard. Nothing but enabling
 * billing changes that, so re-checking every 15 minutes is pure waste — park it
 * for hours and let it self-heal if the account is ever upgraded.
 */
const ZERO_QUOTA_COOLDOWN_MS = (parseInt(process.env.TTS_ZERO_QUOTA_COOLDOWN_HR || '6', 10) || 6) * 3_600_000

interface QuotaInfo {
  /** How long to park this model. */
  cooldownMs: number
  /** Human-readable reason for the log line. */
  reason: string
}

/** Turn a 429 body into a parking decision. */
function readQuotaError(body: string): QuotaInfo {
  let parsed: {
    error?: {
      message?: string
      details?: {
        '@type'?: string
        retryDelay?: string
        violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string }[]
      }[]
    }
  } | null = null
  try {
    parsed = JSON.parse(body)
  } catch {
    return { cooldownMs: DEFAULT_COOLDOWN_MS, reason: 'HTTP 429' }
  }

  const details = parsed?.error?.details || []
  const violations = details.flatMap((d) => d.violations || [])
  // `limit: 0` on EVERY violation means the tier grants this model nothing —
  // never used, never usable. The structured quotaValue is omitted in that case,
  // so fall back to the message text, which does spell out "limit: 0".
  const zeroAllowance =
    violations.length > 0 &&
    violations.every((v) => !v.quotaValue || v.quotaValue === '0') &&
    /limit:\s*0\b/.test(parsed?.error?.message || '')
  if (zeroAllowance) {
    return {
      cooldownMs: ZERO_QUOTA_COOLDOWN_MS,
      reason: 'not available on this tier (free-tier limit is 0 — needs billing)',
    }
  }

  const daily = violations.find((v) => /PerDay/i.test(v.quotaId || ''))
  if (daily) {
    return {
      cooldownMs: DAILY_COOLDOWN_MS,
      reason: `daily cap spent (limit ${daily.quotaValue ?? '?'}/day)`,
    }
  }

  const delay = details.find((d) => d.retryDelay)?.retryDelay
  const secs = delay ? parseFloat(delay) : NaN
  const ms = Number.isFinite(secs) ? secs * 1000 : DEFAULT_COOLDOWN_MS
  const first = violations[0]
  return {
    cooldownMs: Math.min(Math.max(ms, MIN_COOLDOWN_MS), MAX_COOLDOWN_MS),
    reason: first?.quotaId ? `rate limited (${first.quotaId})` : 'rate limited',
  }
}

/**
 * Cooldown slot for a (model, key) pair. Quota is per key's project, so each
 * pair parks independently. The primary keeps the bare model name so cooldowns
 * recorded before the backup key existed still apply.
 */
function slotFor(model: string, key: GeminiKey): string {
  return key.id === 'primary' ? model : `${model}@${key.id}`
}

/** One generation attempt against one model. Returns null when it's rate-limited. */
async function generateWith(model: string, req: SpeakRequest, key: GeminiKey): Promise<Buffer | null> {
  // The style instruction and the text go in one part; the model treats the
  // leading direction as performance guidance rather than content to read out.
  const prompt = `${TTS_STYLES[req.style]}\n\n${req.text}`

  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${key.key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          ...(ttsLanguageSupported(req.lang) ? { languageCode: req.lang } : {}),
          voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice || defaultVoice() } },
        },
      },
    }),
  })

  if (res.status === 429 || res.status === 503) {
    const body = await res.text().catch(() => '')
    // 503 is overload, not exhaustion — a short park lets the next model take
    // over now without writing off this one for the rest of the day.
    const { cooldownMs, reason } =
      res.status === 429 ? readQuotaError(body) : { cooldownMs: MIN_COOLDOWN_MS, reason: 'overloaded (503)' }
    await park(slotFor(model, key), cooldownMs, reason)
    return null
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new TtsUnavailableError(`Gemini TTS HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }

  const data = await res.json()
  const inline = data?.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string } }) => p?.inlineData?.data
  )?.inlineData
  if (!inline?.data) throw new TtsUnavailableError('Gemini TTS returned no audio')

  const pcm = Buffer.from(inline.data, 'base64')
  const { sampleRate, channels, bits } = parsePcmMime(String(inline.mimeType || ''))

  // Compress before it ever touches storage. If the encoder fails for any
  // reason, fall back to WAV — a big cache entry beats no audio at all.
  try {
    return await pcmToMp3(pcm, sampleRate, channels)
  } catch (e) {
    console.warn('[tts] MP3 encode failed, storing WAV:', (e as Error).message)
    return pcmToWav(pcm, sampleRate, channels, bits)
  }
}

/**
 * Generate expressive speech, walking the model cascade. Returns a ready-to-play
 * MP3 buffer and the model that produced it. Throws TtsRateLimitError only when
 * every model in the chain is out of quota.
 */
async function generate(req: SpeakRequest): Promise<{ audio: Buffer; model: string }> {
  const keys = geminiKeys()
  if (!keys.length) throw new TtsUnavailableError('GEMINI_API_KEY not set')

  const chain = ttsModelChain()
  // Every model on the primary key first, then every model on the backup key.
  const attempts = keys.flatMap((key) => chain.map((model) => ({ model, key, slot: slotFor(model, key) })))
  let lastError: Error | undefined
  const parked: { model: string; key: GeminiKey; slot: string; until: number }[] = []

  for (const { model, key, slot } of attempts) {
    const until = await cooledUntil(slot)
    if (until) {
      parked.push({ model, key, slot, until })
      continue
    }
    try {
      const audio = await generateWith(model, req, key)
      if (audio) return { audio, model }
      // null = rate-limited and already parked; fall through to the next model.
    } catch (e) {
      // A hard failure on one model (bad voice, network blip) shouldn't sink the
      // whole request — the next model may well answer. Keep the error in case
      // none does.
      lastError = e as Error
      console.warn(`[tts] ${slot} failed:`, lastError.message)
    }
  }

  // LAST RESORT. Cooldowns are deliberately conservative — a model whose quota
  // has already recovered can still be parked for several more minutes (verified:
  // a model reporting "parked 9m" answered a live probe fine). Rather than drop
  // the learner to the flat browser voice on a stale assumption, spend one
  // request confirming it: try whichever park expires soonest. Worst case that's
  // a fast 429 that simply re-parks the model.
  if (parked.length > 0 && !lastError) {
    const soonest = parked.sort((a, b) => a.until - b.until)[0]
    console.warn(`[tts] all models parked — re-checking ${soonest.slot} before giving up`)
    try {
      const audio = await generateWith(soonest.model, req, soonest.key)
      if (audio) {
        // The park was stale: clear it so the next request doesn't pay for this
        // probe all over again.
        cooldownCache.delete(soonest.slot)
        await AiBackendState.updateOne(
          { backend: COOLDOWN_PREFIX + soonest.slot },
          { $set: { cooldownUntil: new Date(0) } }
        ).catch(() => {})
        return { audio, model: soonest.model }
      }
    } catch (e) {
      lastError = e as Error
    }
  }

  // Genuinely nothing left. Rate-limit specifically, so /api/tts can tell the
  // client to fall back to the browser voice rather than showing an error.
  if (!lastError) {
    throw new TtsRateLimitError(`All TTS models out of quota (${attempts.map((a) => a.slot).join(', ')})`)
  }
  throw lastError
}

/** Sniff the container so the cache records the right Content-Type. */
function sniffMime(buf: Buffer): string {
  // 'RIFF' magic means we fell back to WAV.
  return buf.length >= 4 && buf.toString('ascii', 0, 4) === 'RIFF' ? 'audio/wav' : 'audio/mpeg'
}

export interface SpeakResult {
  /** Present when the clip is served inline (no CDN configured). */
  audio?: Buffer
  /** Present when the clip lives on the CDN — hand this to the browser instead. */
  url?: string
  mimeType: string
  /** True when served from the shared cache (no generation cost incurred). */
  cached: boolean
  /** How many bytes the clip is, regardless of where it lives. */
  bytes: number
  /** Which model in the cascade generated it (absent on a cache hit). */
  model?: string
}

/**
 * Cache lookup ONLY — never generates, never touches the upstream quota.
 *
 * Split out from speakExpressive so /api/tts can answer a cache hit before any
 * gate runs: already-paid-for audio (sitting on the CDN) must never be withheld
 * because a quota or rate limit elsewhere is exhausted. It is also what lets the
 * client keep playing whatever expressive audio exists after generation has run
 * out, instead of dropping the whole passage to the device voice.
 */
/**
 * Normalise a stored binary field to a real Buffer.
 *
 * `.lean()` hands back the driver's BSON `Binary`, NOT a Node Buffer, and
 * `Buffer.from(binary)` silently returns ZERO bytes instead of throwing. That
 * made every inline (no-CDN) cache hit serve an empty body: /api/tts answered
 * 200 with Content-Length 0, the <audio> element errored, and the client
 * "fell back" to the device voice — indistinguishable from a cache miss, which
 * is exactly how this was first noticed. The real bytes live on `.buffer`.
 */
function toBuffer(v: unknown): Buffer {
  if (!v) return Buffer.alloc(0)
  if (Buffer.isBuffer(v)) return v
  const inner = (v as { buffer?: unknown }).buffer
  if (Buffer.isBuffer(inner)) return inner
  if (inner instanceof Uint8Array) return Buffer.from(inner)
  if (v instanceof Uint8Array) return Buffer.from(v)
  return Buffer.alloc(0)
}

export interface SpeakOptions {
  /** Only Langi's own local voices: never look up, or generate, Gemini audio. */
  localOnly?: boolean
}

/**
 * Cached audio for this request. Our own designed voices win over Gemini clips
 * of the same text, so once the overnight run has covered something the whole
 * app hears one consistent set of voices.
 */
export async function cachedClip(req: SpeakRequest, opts: SpeakOptions = {}): Promise<SpeakResult | null> {
  const local = localCacheKey(req)
  if (local) {
    const hit = await cachedByKey(local)
    if (hit) return hit
  }
  return opts.localOnly ? null : cachedByKey(cacheKey(req))
}

async function cachedByKey(key: string): Promise<SpeakResult | null> {
  await connectDB()
  // findOneAndUpdate rather than findOne so the popularity counters stay current
  // in the same round-trip. Entries never expire — see lib/models/TtsCache.ts.
  const hit = await TtsCache.findOneAndUpdate(
    { key },
    { $inc: { hits: 1 }, $set: { lastUsedAt: new Date() } },
    { returnDocument: 'after' }
  ).lean()
  // URL first: rows written while a CDN was configured stay valid even if the
  // backend later changes, and vice-versa for inline rows.
  if (hit?.url) {
    return { url: hit.url, mimeType: hit.mimeType, cached: true, bytes: hit.bytes ?? 0 }
  }
  if (hit?.audio) {
    const buf = toBuffer(hit.audio)
    // A zero-length row is corrupt, not a hit — report a miss so the caller
    // regenerates instead of handing the learner a silent clip.
    if (buf.length > 0) {
      return { audio: buf, mimeType: hit.mimeType, cached: true, bytes: buf.length }
    }
    console.warn(`[tts] cache row ${key.slice(0, 8)} has empty audio — regenerating`)
  }
  return null
}

/**
 * Cache-first expressive speech. On a miss: Langi's own local voice when the
 * local server is configured (free), else Gemini. Generated clips are stored;
 * a failure to write the cache is swallowed, since the audio itself is good.
 */
export async function speakExpressive(req: SpeakRequest, opts: SpeakOptions = {}): Promise<SpeakResult> {
  const hit = await cachedClip(req, opts)
  if (hit) return hit

  const voice = voiceFor(req.lang, req.style)
  const localKey = localCacheKey(req)
  if (voice && localKey && localTtsUrl()) {
    try {
      const { pcm, sampleRate, channels, bits } = await generateLocal(req.text, voice)
      const audio = await encodeForStorage(pcm, sampleRate, channels, bits)
      return await storeClip(localKey, audio, `local:${voice.id}`, req)
    } catch (e) {
      if (opts.localOnly) throw e
      console.warn(`[tts] local ${voice.id} failed, trying Gemini:`, (e as Error).message)
    }
  }
  if (opts.localOnly) {
    throw new TtsUnavailableError(voice ? 'LOCAL_TTS_URL not set' : `no local voice for ${req.lang}/${req.style}`)
  }

  const { audio, model } = await generate(req)
  return storeClip(cacheKey(req), audio, model, req)
}

/** MP3 when possible (16-bit PCM), else WAV — a big cache entry beats no audio. */
async function encodeForStorage(pcm: Buffer, sampleRate: number, channels: number, bits: number): Promise<Buffer> {
  if (bits === 16) {
    try {
      return await pcmToMp3(pcm, sampleRate, channels)
    } catch (e) {
      console.warn('[tts] MP3 encode failed, storing WAV:', (e as Error).message)
    }
  }
  return pcmToWav(pcm, sampleRate, channels, bits)
}

/** Upload (when a CDN is configured) and index a freshly generated clip. */
async function storeClip(key: string, audio: Buffer, model: string, req: SpeakRequest): Promise<SpeakResult> {
  const mimeType = sniffMime(audio)

  // Push to the CDN when one is configured. On failure fall back to storing the
  // bytes inline — a slower delivery path is far better than losing a clip we
  // have already generated.
  let url: string | undefined
  if (cloudinaryConfigured()) {
    try {
      url = await uploadAudio(key, audio, mimeType)
    } catch (e) {
      console.warn('[tts] CDN upload failed, storing inline:', (e as Error).message)
    }
  }

  try {
    await connectDB()
    await TtsCache.updateOne(
      { key },
      {
        $set: {
          key, mimeType, bytes: audio.length, genModel: model,
          lang: req.lang, style: req.style, lastUsedAt: new Date(),
          // Store one or the other, never both — and clear the counterpart so a
          // backend switch can't leave a stale duplicate behind.
          ...(url ? { url } : { audio }),
        },
        $unset: url ? { audio: '' } : { url: '' },
        $setOnInsert: { createdAt: new Date() },
        $inc: { hits: 1 },
      },
      { upsert: true }
    )
  } catch (e) {
    // A cache write failure must never lose the audio we already generated.
    console.warn('[tts] cache write failed:', (e as Error).message)
  }

  return url
    ? { url, mimeType, cached: false, bytes: audio.length, model }
    : { audio, mimeType, cached: false, bytes: audio.length, model }
}

/** Is this clip already cached? Used by the pre-warm script to skip work. */
export async function isCached(req: SpeakRequest, opts: SpeakOptions = {}): Promise<boolean> {
  await connectDB()
  const local = localCacheKey(req)
  if (local && await TtsCache.exists({ key: local })) return true
  if (opts.localOnly) return false
  return Boolean(await TtsCache.exists({ key: cacheKey(req) }))
}
