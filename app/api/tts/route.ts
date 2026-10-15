import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { checkLimit } from '@/lib/ratelimit'
import {
  speakExpressive,
  cachedClip,
  isTtsStyle,
  expressiveTtsConfigured,
  TtsRateLimitError,
  MAX_TTS_CHARS,
  TTS_VOICES,
} from '@/lib/expressiveTts'

// Expressive read-aloud audio. Returns a WAV body on success.
//
// Every failure path returns JSON with a 4xx/5xx so the client can fall back to
// the browser's built-in speech rather than leaving the learner with silence —
// the app must stay usable when the quota is gone or the network is down.
//
// CACHE FIRST, UNCONDITIONALLY. The cache lookup runs before every gate: audio
// that has already been generated and paid for lives on the CDN and costs
// nothing to serve, so no quota or rate limit may withhold it. Only GENERATION
// — the expensive path — is gated. This is also what makes partial expressive
// playback work: once generation is exhausted the client re-asks with
// `cacheOnly`, and every sentence that was warmed still plays in the good voice
// while the rest falls back to the device voice.

export const dynamic = 'force-dynamic'
// Generation runs ~7s for a sentence, comfortably over the default budget.
export const maxDuration = 60

/**
 * One success shape for both the cache and the generator.
 *   CDN-backed  -> JSON { url }: the clip never streams through this function
 *                  and the browser can cache it across sessions.
 *   No CDN      -> the raw bytes inline.
 * The client branches on Content-Type.
 */
function respond(clip: { audio?: Buffer; url?: string; mimeType: string; cached: boolean }) {
  const headers = {
    // The response is a pure function of the posted body, so it's safe to keep
    // for a long time. private: it's behind auth.
    'Cache-Control': 'private, max-age=86400',
    'X-Tts-Cached': clip.cached ? '1' : '0',
  }
  if (clip.url) return NextResponse.json({ url: clip.url, mimeType: clip.mimeType, cached: clip.cached }, { headers })
  if (!clip.audio) return NextResponse.json({ error: 'Speech unavailable.', fallback: true }, { status: 503 })
  return new NextResponse(new Uint8Array(clip.audio), {
    status: 200,
    headers: { ...headers, 'Content-Type': clip.mimeType, 'Content-Length': String(clip.audio.length) },
  })
}

export async function POST(req: NextRequest) {
  if (!expressiveTtsConfigured()) {
    return NextResponse.json({ error: 'Expressive speech is not configured.' }, { status: 501 })
  }

  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { text?: string; lang?: string; style?: string; voice?: string; cacheOnly?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = String(body.text || '').trim()
  const lang = String(body.lang || 'en-US').trim()
  const style = String(body.style || 'clear')
  const voice = body.voice ? String(body.voice) : undefined

  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
  if (text.length > MAX_TTS_CHARS) {
    return NextResponse.json(
      { error: `text exceeds ${MAX_TTS_CHARS} characters — split it into sentences.` },
      { status: 413 }
    )
  }
  if (!isTtsStyle(style)) return NextResponse.json({ error: 'Unknown style' }, { status: 400 })
  // Reject unknown voices rather than passing them through — the upstream error
  // for a bad voiceName is opaque.
  if (voice && !(TTS_VOICES as readonly string[]).includes(voice)) {
    return NextResponse.json({ error: 'Unknown voice' }, { status: 400 })
  }

  const req_ = { text, lang, style, voice }

  try {
    // 1. CACHE. No gate in front of this — see the header comment.
    const hit = await cachedClip(req_)
    if (hit) return respond(hit)

    // 2. Cache-only probe: the client already knows generation is unavailable and
    // is just harvesting whatever was warmed earlier. Answer cheaply and let it
    // use the device voice for this sentence.
    if (body.cacheOnly) {
      return NextResponse.json({ error: 'Not cached.', fallback: true, cached: false }, { status: 404 })
    }

    // 3. GENERATION — the expensive path, and the only one worth rate limiting.
    const limit = await checkLimit(String(dbUser._id), 'tts')
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Speech limit reached for now.', fallback: true, exhausted: true },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } }
      )
    }

    return respond(await speakExpressive(req_))
  } catch (e) {
    if (e instanceof TtsRateLimitError) {
      // `exhausted` tells the client to stop asking for NEW audio and switch to
      // cache-only harvesting + the device voice, rather than paying a failed
      // round-trip per remaining sentence.
      return NextResponse.json(
        { error: 'Speech quota exhausted upstream.', fallback: true, exhausted: true },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
    console.warn('[tts] generation failed:', (e as Error).message)
    return NextResponse.json({ error: 'Speech unavailable.', fallback: true }, { status: 503 })
  }
}
