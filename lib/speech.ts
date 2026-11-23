'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MAX_CLIP_CHARS, ngLangCode, playNgAudio, stopNgAudio } from '@/lib/ngAudio'

// ---------------------------------------------------------------------------
// Web Speech API hooks (TTS + STT). TTS works on Safari/iOS too (Chromium is
// just smoothest); the catch on Safari is voice QUALITY: it defaults to a small
// robotic "compact" system voice, and getVoices() is empty until the async
// 'voiceschanged' event fires. So useTTS below (a) keeps a live voice cache, (b)
// picks the clearest installed voice for the language (Siri/Enhanced/Premium
// over compact), and (c) chunks long text to dodge iOS Safari's ~15s cutoff.
// Note: the highest-quality voices must be installed by the user on-device
// (iOS: Settings → Accessibility → Spoken Content → Voices) — a web page can't
// install them, so that's the ceiling for fully-on-device clarity.
// The app is text-first everywhere — these are strictly additive. Each hook
// exposes a `supported` flag so callers can hide the control + show an honest
// note instead of silently shipping a broken button.
// ---------------------------------------------------------------------------

// Capability is static for the page lifetime, so read it via useSyncExternalStore
// (server snapshot = false) — no setState-in-effect, no hydration mismatch.
const noopSubscribe = () => () => {}
function useCapability(check: () => boolean): boolean {
  return useSyncExternalStore(noopSubscribe, check, () => false)
}

const ttsCheck = () => typeof window !== 'undefined' && 'speechSynthesis' in window

// Live voice cache. Safari/Chrome return [] from getVoices() until the async
// 'voiceschanged' event fires, so we prime this on mount and keep it fresh —
// that way the very first tap already has the full list to choose from.
let voiceCache: SpeechSynthesisVoice[] = []
function readVoices() {
  if (!ttsCheck()) return
  const v = window.speechSynthesis.getVoices()
  if (v.length) voiceCache = v
}

// Pick the CLEAREST voice for `lang`, across every platform. High-quality
// voices advertise themselves in the name, so we score by vendor keyword:
//   Apple (Safari + ALL iOS/iPadOS browsers): Siri / Enhanced / Premium (good),
//     "Compact" = the muffled preinstalled default (bad).
//   Microsoft (Edge / Windows): "Natural" / "Online" = neural cloud voices.
//   Google (Chrome desktop + Android): "Google …" network voices.
// Network voices (localService === false) are generally the better ones.
function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
  voiceName?: string,
  preferLocal = false
): SpeechSynthesisVoice | undefined {
  if (voiceName) {
    const exact = voices.find((v) => v.name === voiceName)
    // Offline, a saved cloud voice (localService===false) would just be silent, so
    // fall through to on-device scoring instead of honouring the stale preference.
    if (exact && !(preferLocal && exact.localService === false)) return exact
  }
  const prefix = lang.slice(0, 2).toLowerCase()
  const matches = voices.filter((v) => v.lang?.toLowerCase().startsWith(prefix))
  if (!matches.length) return undefined
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase()
    let s = 0
    if (n.includes('siri')) s += 6
    if (n.includes('enhanced') || n.includes('premium')) s += 5
    if (n.includes('natural') || n.includes('neural') || n.includes('online')) s += 5
    if (n.includes('google')) s += 4
    if (n.includes('compact')) s -= 4
    // Offline: a cloud voice won't produce sound, so strongly favour on-device
    // voices; online we mildly prefer the (usually higher-quality) cloud ones.
    if (preferLocal) s += v.localService === false ? -20 : 8
    else if (v.localService === false) s += 2
    if (v.lang?.toLowerCase() === lang.toLowerCase()) s += 2
    if (v.default) s += 1
    return s
  }
  return [...matches].sort((a, b) => score(b) - score(a))[0]
}

// Split into sentence-sized chunks (≤180 chars). iOS Safari silently stops
// speaking long utterances after ~15s; queueing short chunks avoids that and
// makes cancel/replay snappier.
function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const parts = clean.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [clean]
  const chunks: string[] = []
  let cur = ''
  for (const p of parts) {
    if (cur && (cur + p).length > 180) {
      chunks.push(cur.trim())
      cur = p
    } else {
      cur += p
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

// ---------------------------------------------------------------------------
// Shared reading speed.
//
// Learners overwhelmingly want speech SLOWER than native pace, and the setting
// only makes sense if it applies everywhere — a story read at 0.7× and a
// flashcard read at 0.95× feels broken. So the rate lives in one module-level
// store that every utterance in the app reads from, persisted per-device
// (like the theme) rather than on the account.
// ---------------------------------------------------------------------------

const RATE_KEY = 'langi-tts-rate'
export const RATE_MIN = 0.5
export const RATE_MAX = 1.25
export const RATE_DEFAULT = 0.95
/** Presets for the speed control, slowest first. */
export const RATE_STEPS = [0.5, 0.65, 0.8, 0.95, 1.1, 1.25]

let rateValue: number | null = null
const rateListeners = new Set<() => void>()

function clampRate(n: number): number {
  return Math.min(RATE_MAX, Math.max(RATE_MIN, n))
}

/** Current speaking rate. Reads localStorage once, then serves from memory. */
export function getSpeechRate(): number {
  if (rateValue !== null) return rateValue
  let r = RATE_DEFAULT
  try {
    const raw = localStorage.getItem(RATE_KEY)
    const n = raw ? parseFloat(raw) : NaN
    if (Number.isFinite(n)) r = clampRate(n)
  } catch {
    // Storage blocked — fall back to the default for this session.
  }
  rateValue = r
  return r
}

export function setSpeechRate(next: number) {
  rateValue = clampRate(next)
  try {
    localStorage.setItem(RATE_KEY, String(rateValue))
  } catch {
    // Non-fatal: the rate still applies until reload.
  }
  rateListeners.forEach((l) => l())
}

function subscribeRate(cb: () => void) {
  rateListeners.add(cb)
  return () => { rateListeners.delete(cb) }
}

/** Subscribe to the shared rate so a speed control re-renders every consumer. */
export function useSpeechRate(): number {
  // Server snapshot is the default — the real value is read on the client after
  // hydration, same pattern as useCapability above.
  return useSyncExternalStore(subscribeRate, getSpeechRate, () => RATE_DEFAULT)
}

/** Live, language-filtered list of installed voices, best-first. Powers the
 *  settings voice picker. Re-renders when the async voice list arrives. */
export function useVoices(lang = 'fr-FR'): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!ttsCheck()) return
    const synth = window.speechSynthesis
    const refresh = () => {
      readVoices()
      const prefix = lang.slice(0, 2).toLowerCase()
      const matches = (voiceCache.length ? voiceCache : synth.getVoices()).filter((v) =>
        v.lang?.toLowerCase().startsWith(prefix)
      )
      setVoices(matches)
    }
    refresh()
    synth.addEventListener?.('voiceschanged', refresh)
    return () => synth.removeEventListener?.('voiceschanged', refresh)
  }, [lang])
  return voices
}

/** Speak text aloud in the target language. `defaultVoice` (the learner's saved
 *  preference) is used whenever speak() isn't given an explicit voice name. */
export function useTTS(lang = 'fr-FR', defaultVoice?: string) {
  const supported = useCapability(ttsCheck)
  const [speaking, setSpeaking] = useState(false)
  // Bumped on every speak()/cancel() so callbacks from a superseded utterance
  // can't flip `speaking` back on after a new one starts.
  const genRef = useRef(0)

  // Prime the voice cache and keep it current — voices arrive asynchronously.
  useEffect(() => {
    if (!ttsCheck()) return
    readVoices()
    const synth = window.speechSynthesis
    const onChange = () => readVoices()
    synth.addEventListener?.('voiceschanged', onChange)
    return () => synth.removeEventListener?.('voiceschanged', onChange)
  }, [])

  const speak = useCallback(
    (text: string, voiceName?: string) => {
      const ng = ngLangCode(lang)
      if (ng && process.env.NEXT_PUBLIC_NG_AUDIO_BASE_URL && text.trim().length <= MAX_CLIP_CHARS) {
        // Yoruba / Igbo / Hausa / French card terms: play the pre-generated recording; no file or no network → device voice.
        const gen = ++genRef.current
        if (ttsCheck()) window.speechSynthesis.cancel()
        setSpeaking(true)
        void playNgAudio(ng, text, getSpeechRate()).then((played) => {
          if (gen !== genRef.current) return
          if (played) setSpeaking(false)
          else speakWithDevice(text, voiceName, gen)
        })
        return
      }
      speakWithDevice(text, voiceName, ++genRef.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, defaultVoice]
  )

  const speakWithDevice = useCallback(
    (text: string, voiceName: string | undefined, gen: number) => {
      if (!ttsCheck()) { setSpeaking(false); return }
      const synth = window.speechSynthesis
      synth.cancel()
      const chunks = chunkText(text)
      if (!chunks.length) return
      // Offline, prefer on-device voices — cloud voices (Google/Microsoft online)
      // produce no audio without a network, so a local voice is the only one that speaks.
      const preferLocal = typeof navigator !== 'undefined' && !navigator.onLine
      const voice = pickVoice(voiceCache.length ? voiceCache : synth.getVoices(), lang, voiceName || defaultVoice, preferLocal)
      let i = 0
      setSpeaking(true)
      const speakNext = () => {
        if (gen !== genRef.current) return // superseded by a newer speak()/cancel()
        if (i >= chunks.length) {
          setSpeaking(false)
          return
        }
        const u = new SpeechSynthesisUtterance(chunks[i++])
        u.lang = lang
        // Read the shared rate per chunk so a speed change mid-playback takes
        // effect on the next sentence rather than needing a restart.
        u.rate = getSpeechRate()
        if (voice) u.voice = voice
        u.onend = () => speakNext()
        u.onerror = () => {
          if (gen === genRef.current) setSpeaking(false)
        }
        // iOS can leave the queue paused between chunks — nudge it.
        try {
          synth.resume()
        } catch {}
        synth.speak(u)
      }
      speakNext()
    },
    [lang, defaultVoice]
  )

  const cancel = useCallback(() => {
    stopNgAudio()
    if (ttsCheck()) {
      genRef.current++ // invalidate any in-flight chunk queue
      window.speechSynthesis.cancel()
      setSpeaking(false)
    }
  }, [])

  return { supported, speaking, speak, cancel }
}

/**
 * Kept as the name callers already use. It speaks with the device voice (useTTS): free, instant and
 * available offline. (The server-generated and pre-recorded voices were removed: every AI call now goes
 * through Firebase AI Logic, and the device voice is the hybrid app's "on-device" speech.)
 */
export function useSavedVoice(lang = 'fr-FR', defaultVoice?: string) {
  const tts = useTTS(lang, defaultVoice)
  return { supported: tts.supported, speaking: tts.speaking, speak: (text: string) => tts.speak(text), cancel: tts.cancel }
}

// ---------------------------------------------------------------------------
// Continuous read-aloud ("dictate reading").
//
// useTTS.speak() is fire-and-forget: it chunks internally and reports nothing
// back, so a caller can't tell WHICH sentence is being spoken. Follow-along
// reading — the thing that actually helps a learner map sound to text — needs
// that, so this hook walks a list of segments (usually sentences or paragraphs)
// one at a time and publishes the active index for the UI to highlight.
// ---------------------------------------------------------------------------

export type ReadStatus = 'idle' | 'playing' | 'paused'

export interface ReadAloudControls {
  supported: boolean
  status: ReadStatus
  /** Segment currently being spoken, or -1 when idle. */
  index: number
  /** Start (or restart) from a segment; defaults to the beginning. */
  play: (from?: number) => void
  /** Pause, keeping the position. */
  pause: () => void
  /** Resume from the paused segment. */
  resume: () => void
  /** Stop and reset to the beginning. */
  stop: () => void
  /** Toggle play/pause — what the primary transport button calls. */
  toggle: () => void
  next: () => void
  prev: () => void
  jump: (i: number) => void
  rate: number
  setRate: (r: number) => void
}

/**
 * Continuous read-aloud on the browser's speechSynthesis: free, instant and available offline.
 * It walks the segments one at a time and publishes the active index so the UI can highlight it.
 */
export function useReadAloud(
  segments: string[],
  lang = 'fr-FR',
  defaultVoice?: string
): ReadAloudControls {
  const supported = useCapability(ttsCheck)
  const [status, setStatus] = useState<ReadStatus>('idle')
  const [index, setIndex] = useState(-1)
  const rate = useSpeechRate()

  // Generation counter: bumped on every transport action so a superseded
  // playback loop exits instead of advancing the position.
  const genRef = useRef(0)
  const segRef = useRef(segments)
  const indexRef = useRef(-1)
  const statusRef = useRef<ReadStatus>('idle')
  const langRef = useRef(lang)

  useEffect(() => { segRef.current = segments }, [segments])
  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { langRef.current = lang }, [lang])

  /** Speak one segment with the browser engine. Resolves when finished. */
  const speakBrowser = useCallback((text: string, gen: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!ttsCheck()) { resolve(); return }
      const synth = window.speechSynthesis
      const chunks = chunkText(text)
      if (!chunks.length) { resolve(); return }
      const preferLocal = typeof navigator !== 'undefined' && !navigator.onLine
      const voice = pickVoice(
        voiceCache.length ? voiceCache : synth.getVoices(),
        langRef.current,
        defaultVoice,
        preferLocal
      )
      let ci = 0
      const speakChunk = () => {
        if (gen !== genRef.current) { resolve(); return }
        if (ci >= chunks.length) { resolve(); return }
        const u = new SpeechSynthesisUtterance(chunks[ci++])
        u.lang = langRef.current
        u.rate = getSpeechRate()
        if (voice) u.voice = voice
        u.onend = speakChunk
        // Also covers "another component cancelled us".
        u.onerror = () => resolve()
        try { synth.resume() } catch {}
        synth.speak(u)
      }
      speakChunk()
    })
  }, [defaultVoice])

  const silence = useCallback(() => {
    if (ttsCheck()) window.speechSynthesis.cancel()
  }, [])

  const play = useCallback((from = 0) => {
    const segs = segRef.current
    if (!segs.length) return
    const gen = ++genRef.current
    silence()
    setStatus('playing')

    void (async () => {
      for (let i = Math.max(0, Math.min(from, segs.length - 1)); i < segs.length; i++) {
        if (gen !== genRef.current) return
        setIndex(i)
        await speakBrowser(segs[i], gen)
        if (gen !== genRef.current) return
      }
      if (gen !== genRef.current) return
      setStatus('idle')
      setIndex(-1)
    })()
  }, [speakBrowser, silence])

  // Pause is cancel-and-remember rather than speechSynthesis.pause(), which is
  // unreliable on iOS Safari (the queue can never resume). Resuming re-reads the
  // current sentence from its start, which for a learner is usually welcome.
  const pause = useCallback(() => {
    genRef.current++
    silence()
    setStatus('paused')
  }, [silence])

  const resume = useCallback(() => { play(Math.max(0, indexRef.current)) }, [play])

  const stop = useCallback(() => {
    genRef.current++
    silence()
    setStatus('idle')
    setIndex(-1)
  }, [silence])

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause()
    else if (statusRef.current === 'paused') resume()
    else play(0)
  }, [pause, resume, play])

  const next = useCallback(() => { play(indexRef.current + 1) }, [play])
  const prev = useCallback(() => { play(Math.max(0, indexRef.current - 1)) }, [play])
  const jump = useCallback((i: number) => { play(i) }, [play])

  const changeRate = useCallback((r: number) => {
    setSpeechRate(r)
    // Browser speech only picks the new rate up on the next utterance, so restart the sentence.
    if (statusRef.current === 'playing' && indexRef.current >= 0) play(indexRef.current)
  }, [play])

  // Never leave audio playing after the reader unmounts (route change, sheet close).
  useEffect(() => {
    return () => {
      // The refs are mutable counters, not rendered nodes: we need their LATEST values to cancel
      // whatever is in flight, so reading them in cleanup is the intent.
      /* eslint-disable react-hooks/exhaustive-deps */
      genRef.current++
      if (ttsCheck()) window.speechSynthesis.cancel()
      /* eslint-enable react-hooks/exhaustive-deps */
    }
  }, [])

  return { supported, status, index, play, pause, resume, stop, toggle, next, prev, jump, rate, setRate: changeRate }
}

// Segmentation lives in lib/segments.ts.
export { toSegments } from '@/lib/segments'

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal: boolean }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Dictate speech in the target language with the browser's Web Speech API. Calls `onTranscript` with
 * the text so the caller can FILL AN EDITABLE INPUT: we never auto-submit, so the user can correct
 * transcription noise before it is graded. `needsNetwork` flags engines that transcribe server-side
 * (desktop Chrome/Edge); typing is always the fallback.
 */
export function useSTT(lang = 'fr-FR', onTranscript?: (text: string) => void) {
  const supported = useCapability(() => getRecognitionCtor() !== null)
  const [listening, setListening] = useState(false)
  const [needsNetwork, setNeedsNetwork] = useState(false)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const cbRef = useRef(onTranscript)
  useEffect(() => { cbRef.current = onTranscript }, [onTranscript])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    // Stop any TTS first so the mic doesn't transcribe the speaker (audio echo).
    if (ttsCheck()) window.speechSynthesis.cancel()
    const rec = new Ctor()
    rec.lang = lang
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      // Emit ONLY the newly finalized segment. `e.results` is cumulative across
      // the session and onresult can fire multiple times, so joining the whole
      // list (and the caller appending it) duplicated/echoed earlier words.
      let delta = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) delta += r[0].transcript
      }
      const text = delta.trim()
      if (text) cbRef.current?.(text)
    }
    rec.onerror = (e) => {
      if (e?.error === 'network') setNeedsNetwork(true)
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }, [lang])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { supported, listening, needsNetwork, start, stop }
}
