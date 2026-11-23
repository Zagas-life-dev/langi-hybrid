// Pre-generated read-aloud audio for Yoruba, Igbo and Hausa (browsers have no voices for them).
// scripts/generate-ng-audio.mjs writes tts-out/<lang>/<id>.mp3; upload that folder somewhere public and
// set NEXT_PUBLIC_NG_AUDIO_BASE_URL to it (no trailing slash). Without the variable, or for a sentence
// with no file, callers fall back to the device voice.

/**
 * ISO code (`yo`) from a BCP-47 tag (`yo-NG`) when we host pre-generated clips for that language: the three
 * Nigerian languages (Gemini TTS) and French cards (local Qwen3-TTS). Other languages use the device voice.
 */
export function ngLangCode(tag: string): 'yo' | 'ig' | 'ha' | 'fr' | null {
  const c = tag.slice(0, 2).toLowerCase()
  return c === 'yo' || c === 'ig' || c === 'ha' || c === 'fr' ? c : null
}

/** Clips exist for card terms and short phrases only; long text (stories, lessons) skips the lookup. */
export const MAX_CLIP_CHARS = 120

/** sha1("<lang>|<term>") first 16 hex chars: the same id the generator script gives each file. */
export async function ngAudioId(lang: string, term: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${lang}|${term.trim()}`)
  const hash = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function ngAudioUrl(lang: string, term: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_NG_AUDIO_BASE_URL?.replace(/\/+$/, '')
  if (!base || typeof crypto === 'undefined' || !crypto.subtle) return null
  return `${base}/${lang}/${await ngAudioId(lang, term)}.mp3`
}

let current: HTMLAudioElement | null = null

export function stopNgAudio() {
  if (current) { current.pause(); current = null }
}

/** Play the recording for `term`. Resolves true when it played to its end or was stopped, false when there is no usable file. */
export async function playNgAudio(lang: string, term: string, rate = 1): Promise<boolean> {
  const url = await ngAudioUrl(lang, term)
  if (!url) return false
  stopNgAudio()
  const audio = new Audio(url)
  audio.playbackRate = rate
  current = audio
  return new Promise<boolean>((resolve) => {
    audio.onended = () => { if (current === audio) current = null; resolve(true) }
    audio.onerror = () => { if (current === audio) current = null; resolve(false) }
    audio.play().catch(() => resolve(false))
  })
}
