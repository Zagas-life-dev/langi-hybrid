import { localVoiceFor, type LocalVoice } from '@/lib/ttsVoices'
import type { TtsStyle } from '@/lib/ttsStyles'

// ---------------------------------------------------------------------------
// Local speech generation: Qwen3-TTS VoiceDesign served by KoboldCpp on a
// machine we run ourselves (LOCAL_TTS_URL, e.g. http://localhost:5001).
//
// Free and unmetered, but slow on a laptop (~3x real time), so its main job is
// the overnight pre-generation run (scripts/warm-tts.ts): every clip it makes is
// uploaded to the CDN once and then served to every learner from the cache.
// Live requests try it too when the server is reachable, before Gemini.
// ---------------------------------------------------------------------------

/** A long sentence takes ~40s on the laptop; anything past this is stuck. */
const TIMEOUT_MS = 3 * 60_000

export function localTtsUrl(): string | null {
  const url = (process.env.LOCAL_TTS_URL || '').trim().replace(/\/+$/, '')
  return url || null
}

/** 'fr-FR' → 'fr', 'en-US' → 'en'. */
export function baseLang(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0]
}

/** The designed voice for this language + style, if we have one. */
export function voiceFor(lang: string, style: TtsStyle): LocalVoice | null {
  return localVoiceFor(baseLang(lang), style)
}

export interface Pcm { pcm: Buffer; sampleRate: number; channels: number; bits: number }

/** Pull the PCM samples and format out of a RIFF/WAVE buffer. */
export function parseWav(buf: Buffer): Pcm {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('local TTS did not return a WAV file')
  }
  let sampleRate = 24000, channels = 1, bits = 16
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2)
      sampleRate = buf.readUInt32LE(body + 4)
      bits = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      return { pcm: buf.subarray(body, Math.min(buf.length, body + size)), sampleRate, channels, bits }
    }
    off = body + size + (size % 2) // chunks are word-aligned
  }
  throw new Error('WAV has no data chunk')
}

/** Is the local server up? Cheap check so a batch can wait for it instead of failing. */
export async function localTtsReachable(): Promise<boolean> {
  const url = localTtsUrl()
  if (!url) return false
  try {
    const res = await fetch(`${url}/api/extra/version`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const info = await res.json().catch(() => null)
    return Boolean(info?.tts)
  } catch {
    return false
  }
}

/**
 * What the model is actually given. Without closing punctuation it never
 * decides the utterance is over: a bare "rapide" ran on to 74s of babble while
 * "rapide." took 4s and came out clean. Only the model input changes — the
 * cache key is still the original text, so the app finds the clip.
 */
export function spokenText(text: string): string {
  const t = text.trim()
  return /[.!?…:;»"”')\]]$/.test(t) ? t : `${t}.`
}

/**
 * Longest plausible clip for `text`: generous (~6 chars/s plus 3s slack —
 * normal speech runs 10-15), so only a runaway, the model babbling on past the
 * end of the line, exceeds it. "Tu parleras." once came back as 8s.
 */
export function maxSeconds(text: string): number {
  return 3 + text.length / 6
}

/**
 * Inputs to try, in order. The seed is fixed, so a text that runs away does so
 * every time — but a trivially different input usually ends cleanly ("Tu
 * parleras." 8s of babble, "tu parleras." 0.9s; "¿y tú?" 5s, "¿Y tú?" 0.7s).
 */
export function spokenVariants(text: string): string[] {
  const base = spokenText(text)
  const flipped = base.replace(/\p{L}/u, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
  const exclaimed = base.replace(/[.…]+$/, '') + ' !'
  return [...new Set([base, flipped, exclaimed])]
}

const durationOf = (w: Pcm) => w.pcm.length / (w.sampleRate * w.channels * (w.bits / 8))

/** Speak `text` in a designed voice. Throws when the server is down or errors. */
export async function generateLocal(text: string, voice: LocalVoice): Promise<Pcm> {
  const url = localTtsUrl()
  if (!url) throw new Error('LOCAL_TTS_URL not set')
  let longest = 0
  for (const input of spokenVariants(text)) {
    const res = await fetch(`${url}/api/extra/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `language` is not optional in practice: KoboldCpp defaults it to English.
      body: JSON.stringify({ input, voice: 'instruct', instruction: voice.instruction, language: voice.language, seed: voice.seed }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`local TTS HTTP ${res.status}`)
    const wav = parseWav(Buffer.from(await res.arrayBuffer()))
    if (wav.pcm.length < 2000) throw new Error('local TTS returned (almost) no audio')
    const seconds = durationOf(wav)
    if (seconds <= maxSeconds(text)) return wav
    longest = Math.max(longest, seconds)
  }
  throw new Error(`runaway audio (${longest.toFixed(0)}s for ${text.length} chars) — not stored`)
}
