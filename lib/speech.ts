'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Model } from 'vosk-browser'
import { offlineSttAvailable, sttModelFor } from '@/lib/sttModels'
// Type only — lib/expressiveTts.ts is server-side (mongoose + node:crypto) and
// must never be imported from here.
import type { TtsStyle } from '@/lib/ttsStyles'
import { voskRuntimeSupported, isModelDownloaded, loadModel, VoskDictation } from '@/lib/voskStt'
import { useToast } from '@/components/Toast'

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

// ---------------------------------------------------------------------------
// Expressive-voice preference.
//
// Stored the same way as the rate, and for the same reason: it's a choice about
// HOW the app should sound, so it has to outlive the component. Previously this
// lived in local component state, which meant turning expressive on for a story
// and then opening a grammar lesson silently dropped you back to the flat
// browser voice — the setting looked like it did nothing.
//
// Module-level + useSyncExternalStore means toggling it anywhere updates every
// mounted reader at once.
// ---------------------------------------------------------------------------

const EXPRESSIVE_KEY = 'langi-tts-expressive'
let expressiveValue: boolean | null = null
const expressiveListeners = new Set<() => void>()

export function getExpressiveEnabled(): boolean {
  if (expressiveValue !== null) return expressiveValue
  let v = false
  try {
    v = localStorage.getItem(EXPRESSIVE_KEY) === '1'
  } catch {
    // Storage blocked — default to the free, always-available browser voice.
  }
  expressiveValue = v
  return v
}

export function setExpressiveEnabled(on: boolean) {
  expressiveValue = on
  try {
    localStorage.setItem(EXPRESSIVE_KEY, on ? '1' : '0')
  } catch {
    // Non-fatal: the choice still applies for this session.
  }
  expressiveListeners.forEach((l) => l())
}

function subscribeExpressive(cb: () => void) {
  expressiveListeners.add(cb)
  return () => { expressiveListeners.delete(cb) }
}

/**
 * Whether expressive audio is switched on. Returns false for the server
 * snapshot so hydration matches; the stored value is picked up right after.
 */
export function useExpressiveEnabled(): boolean {
  return useSyncExternalStore(subscribeExpressive, getExpressiveEnabled, () => false)
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
      if (!ttsCheck()) return
      const synth = window.speechSynthesis
      const gen = ++genRef.current
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
    if (ttsCheck()) {
      genRef.current++ // invalidate any in-flight chunk queue
      window.speechSynthesis.cancel()
      setSpeaking(false)
    }
  }, [])

  return { supported, speaking, speak, cancel }
}

/**
 * useTTS with the pre-generated voices in front: speak() first asks /api/tts
 * for an already-stored clip (cache only — never triggers generation, so a
 * flashcard session can't burn quota) and plays it; anything not stored is
 * spoken by the device voice exactly as useTTS would. Vocabulary clips come
 * from the overnight run (scripts/warm-tts.ts).
 */
export function useSavedVoice(lang = 'fr-FR', defaultVoice?: string) {
  const tts = useTTS(lang, defaultVoice)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const genRef = useRef(0)
  // text|style -> stored clip URL, or null when there isn't one.
  const urls = useRef(new Map<string, string | null>())
  const [playing, setPlaying] = useState(false)

  const stopClip = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(false)
  }, [])

  const savedUrl = useCallback(async (text: string, style: TtsStyle): Promise<string | null> => {
    const key = `${style}|${text}`
    if (urls.current.has(key)) return urls.current.get(key)!
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang, style, cacheOnly: true }),
      })
      let url: string | null = null
      if (res.ok) {
        if (res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json()
          url = typeof data?.url === 'string' ? data.url : null
        } else {
          url = URL.createObjectURL(await res.blob())
        }
      }
      urls.current.set(key, url)
      return url
    } catch {
      return null // network blip: don't remember, try again next time
    }
  }, [lang])

  const speak = useCallback(async (text: string, style: TtsStyle = 'clear') => {
    const gen = ++genRef.current
    stopClip()
    tts.cancel()
    const url = await savedUrl(text.trim(), style)
    if (gen !== genRef.current) return // superseded by a newer speak()/cancel()
    if (!url) { tts.speak(text); return }
    const el = new Audio(url)
    el.playbackRate = getSpeechRate()
    audioRef.current = el
    setPlaying(true)
    const done = () => { if (audioRef.current === el) { audioRef.current = null; setPlaying(false) } }
    el.onended = done
    el.onerror = () => { done(); if (gen === genRef.current) tts.speak(text) }
    el.play().catch(() => { done(); if (gen === genRef.current) tts.speak(text) })
  }, [savedUrl, stopClip, tts])

  const cancel = useCallback(() => {
    genRef.current++
    stopClip()
    tts.cancel()
  }, [stopClip, tts])

  useEffect(() => () => { audioRef.current?.pause() }, [])

  return { supported: tts.supported, speaking: tts.speaking || playing, speak, cancel }
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
 * How long to stop asking for NEW expressive audio after the server says the
 * quota is spent. The upstream daily cap recovers on a rolling basis (minutes),
 * so this is a pause, not a write-off — after it elapses the next sentence tries
 * generation again and expressive playback resumes on its own.
 */
const EXHAUSTED_RETRY_MS = 5 * 60_000

/** Extra state the expressive engine exposes; inert in browser-only mode. */
export interface ExpressiveState {
  /** The learner asked for expressive audio. */
  enabled: boolean
  /** A clip is being generated right now (first play has a real wait). */
  loading: boolean
  /** Expressive was requested but we're serving browser speech instead. */
  degraded: boolean
  /**
   * Generation is used up (upstream quota or the per-user limit). Cached
   * sentences still play in the good voice; everything else uses the device
   * voice. Surfaced so the UI can explain the mixed playback honestly.
   */
  exhausted: boolean
  setEnabled: (v: boolean) => void
}

export interface ReadAloudOptions {
  /** Use server-generated expressive audio instead of flat browser speech. */
  expressive?: boolean
  /** Performance direction sent to the TTS model. */
  style?: TtsStyle
}

/**
 * Continuous read-aloud with two interchangeable engines behind one transport.
 *
 * ENGINE 1 (default) — the browser's speechSynthesis. Free, instant, offline,
 * and completely flat: it cannot convey emotion.
 * ENGINE 2 (expressive) — server-generated audio from Gemini TTS via /api/tts,
 * which performs a style direction ("read like a warm storyteller"). Costs a
 * network round-trip of roughly 5-8s per sentence on a cache miss.
 *
 * Engine 2 is therefore always allowed to fall back to engine 1 — offline, out
 * of quota, an unsupported language, or a segment too long to synthesise all
 * degrade to flat speech rather than to silence. `degraded` reports when that
 * happened so the UI can say so honestly.
 *
 * Latency is hidden by prefetching: while sentence N plays, N+1 is already
 * being generated, so only the first sentence of a passage actually waits.
 */
export function useReadAloud(
  segments: string[],
  lang = 'fr-FR',
  defaultVoice?: string,
  options: ReadAloudOptions = {}
): ReadAloudControls & { expressive: ExpressiveState } {
  const supported = useCapability(ttsCheck)
  const [status, setStatus] = useState<ReadStatus>('idle')
  const [index, setIndex] = useState(-1)
  // Comes from the shared, persisted preference — NOT component state — so it
  // survives navigation and reloads. `options.expressive`, when passed, is a
  // per-surface override for callers that always want one engine.
  const storedExpressive = useExpressiveEnabled()
  const expressiveOn = options.expressive ?? storedExpressive
  const [loading, setLoading] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const rate = useSpeechRate()
  const style: TtsStyle = options.style ?? 'clear'
  const { toast } = useToast()

  /**
   * Set when the server reports generation is used up. Until it expires we stop
   * asking for NEW audio and send `cacheOnly` instead: already-generated
   * sentences keep playing in the expressive voice and the rest fall back to the
   * device voice, without paying a doomed round-trip per sentence.
   *
   * Time-boxed rather than permanent because the upstream cap recovers on a
   * rolling basis — a learner who keeps the page open shouldn't be stuck on the
   * flat voice for the rest of the session.
   */
  const exhaustedUntilRef = useRef(0)
  const notifiedRef = useRef(false)

  /**
   * Generation just ran out. Tell the learner ONCE per session why the voice
   * changed — silently switching to the flat device voice mid-passage reads as a
   * bug — then keep playing instead of stopping.
   */
  const noteExhausted = useCallback(() => {
    const first = Date.now() >= exhaustedUntilRef.current
    exhaustedUntilRef.current = Date.now() + EXHAUSTED_RETRY_MS
    setExhausted(true)
    if (first && !notifiedRef.current) {
      notifiedRef.current = true
      toast('Enhanced voice limit reached — playing saved audio, then your device voice.', {
        tone: 'info',
        duration: 5000,
      })
    }
  }, [toast])

  // Generation counter: bumped on every transport action so a superseded
  // playback loop exits instead of advancing the position.
  const genRef = useRef(0)
  const segRef = useRef(segments)
  const indexRef = useRef(-1)
  const statusRef = useRef<ReadStatus>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // text -> object URL. Keyed by text (not index) so re-ordering or re-rendering
  // segments can never replay the wrong clip.
  const clipsRef = useRef<Map<string, Promise<string | null>>>(new Map())

  useEffect(() => { segRef.current = segments }, [segments])
  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { statusRef.current = status }, [status])

  const langRef = useRef(lang)
  const styleRef = useRef(style)
  const rateRef = useRef(rate)
  useEffect(() => { langRef.current = lang }, [lang])
  useEffect(() => { styleRef.current = style }, [style])
  useEffect(() => { rateRef.current = rate }, [rate])

  /**
   * Fetch (and memoise) one clip's playable URL. Resolves null when expressive
   * playback isn't possible, which the caller treats as "say it flatly instead".
   *
   * Two response shapes, depending on the server's audio backend:
   *   application/json  -> { url } on a CDN; play it directly, nothing to revoke.
   *   audio/*           -> raw bytes; wrap in an object URL (revoked on unmount).
   */
  const fetchClip = useCallback((text: string): Promise<string | null> => {
    const existing = clipsRef.current.get(text)
    if (existing) return existing
    const p = (async (): Promise<string | null> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return null
      // Generation is spent — ask only for what's already been paid for. The
      // server answers these from the cache with no quota involved.
      const cacheOnly = Date.now() < exhaustedUntilRef.current
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang: langRef.current, style: styleRef.current, cacheOnly }),
        })
        if (!res.ok) {
          // `exhausted` means "stop asking for new audio", as opposed to a
          // one-off failure (bad segment, transient 503) which shouldn't change
          // how the remaining sentences are fetched.
          if (res.status === 429) {
            const info = await res.json().catch(() => null)
            if (info?.exhausted) noteExhausted()
          }
          return null
        }
        if (res.headers.get('content-type')?.includes('application/json')) {
          const data = await res.json()
          return typeof data?.url === 'string' ? data.url : null
        }
        const blob = await res.blob()
        return URL.createObjectURL(blob)
      } catch {
        return null
      }
    })()
    // Memoise SUCCESSES only. A failure is usually temporary (quota spent, a
    // blip), and caching the null would keep that sentence on the flat voice for
    // the rest of the session even after generation recovers.
    void p.then((url) => { if (!url) clipsRef.current.delete(text) })
    clipsRef.current.set(text, p)
    return p
  }, [noteExhausted])

  /** Play one generated clip through an <audio> element. False if it can't. */
  const playClip = useCallback((url: string, gen: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const el = new Audio(url)
      el.playbackRate = rateRef.current
      audioRef.current = el
      const done = (ok: boolean) => {
        el.onended = null
        el.onerror = null
        if (audioRef.current === el) audioRef.current = null
        resolve(ok)
      }
      el.onended = () => done(true)
      el.onerror = () => done(false)
      el.play().catch(() => done(false))
      if (gen !== genRef.current) { el.pause(); done(false) }
    })
  }, [])

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

  /** Halt whatever is currently making sound, without touching status. */
  const silence = useCallback(() => {
    if (ttsCheck()) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  const play = useCallback((from = 0) => {
    const segs = segRef.current
    if (!segs.length) return
    const gen = ++genRef.current
    silence()
    setStatus('playing')
    setDegraded(false)
    // The back-off has elapsed — let this pass try generation again.
    if (Date.now() >= exhaustedUntilRef.current) setExhausted(false)

    void (async () => {
      for (let i = Math.max(0, Math.min(from, segs.length - 1)); i < segs.length; i++) {
        if (gen !== genRef.current) return
        setIndex(i)

        if (expressiveOn) {
          // Start the NEXT sentence generating before playing this one — this is
          // what turns a per-sentence stutter into a single wait up front.
          if (i + 1 < segs.length) void fetchClip(segs[i + 1])
          const pending = fetchClip(segs[i])
          setLoading(true)
          const url = await pending
          if (gen !== genRef.current) return
          setLoading(false)
          if (url) {
            const ok = await playClip(url, gen)
            if (gen !== genRef.current) return
            if (ok) continue
          }
          // Couldn't generate or couldn't play it — say it flatly rather than
          // dropping the sentence entirely.
          setDegraded(true)
        }

        await speakBrowser(segs[i], gen)
        if (gen !== genRef.current) return
      }
      if (gen !== genRef.current) return
      setStatus('idle')
      setIndex(-1)
    })()
  }, [expressiveOn, fetchClip, playClip, speakBrowser, silence])

  // Pause is cancel-and-remember rather than speechSynthesis.pause(), which is
  // unreliable on iOS Safari (the queue can never resume). Resuming re-reads the
  // current sentence from its start, which for a learner is usually welcome.
  const pause = useCallback(() => {
    genRef.current++
    silence()
    setLoading(false)
    setStatus('paused')
  }, [silence])

  const resume = useCallback(() => { play(Math.max(0, indexRef.current)) }, [play])

  const stop = useCallback(() => {
    genRef.current++
    silence()
    setLoading(false)
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
    // Generated audio can change speed in place; browser speech only picks the
    // new rate up on the next utterance, so restart the sentence.
    if (audioRef.current) audioRef.current.playbackRate = r
    else if (statusRef.current === 'playing' && indexRef.current >= 0) play(indexRef.current)
  }, [play])

  const setEnabled = useCallback((v: boolean) => {
    // Persisted, so the choice carries to every other reader and future visits.
    setExpressiveEnabled(v)
    // Turning it back on is an explicit "try again" — drop the back-off so the
    // learner isn't told the limit is reached without us re-checking.
    if (v) {
      exhaustedUntilRef.current = 0
      notifiedRef.current = false
      setExhausted(false)
    }
    // Switching engines mid-passage would mix two different voices; stop clean.
    genRef.current++
    silence()
    setStatus('idle')
    setIndex(-1)
    setLoading(false)
    setDegraded(false)
  }, [silence])

  // Never leave audio playing after the reader unmounts (route change, sheet
  // close), and release the blob URLs we created.
  useEffect(() => {
    const clips = clipsRef.current
    return () => {
      // exhaustive-deps warns about reading refs in cleanup, but that's exactly
      // the intent here: these are mutable counters/handles, not React-rendered
      // nodes, and we need their LATEST values to cancel whatever is in flight.
      // Snapshotting them at effect-setup time would cancel nothing.
      /* eslint-disable react-hooks/exhaustive-deps */
      genRef.current++
      if (ttsCheck()) window.speechSynthesis.cancel()
      audioRef.current?.pause()
      audioRef.current = null
      /* eslint-enable react-hooks/exhaustive-deps */
      // Only object URLs need releasing — CDN https URLs aren't ours to revoke.
      clips.forEach((p) => {
        void p.then((u) => { if (u?.startsWith('blob:')) URL.revokeObjectURL(u) })
      })
      clips.clear()
    }
  }, [])

  return {
    supported,
    status,
    index,
    play,
    pause,
    resume,
    stop,
    toggle,
    next,
    prev,
    jump,
    rate,
    setRate: changeRate,
    expressive: { enabled: expressiveOn, loading, degraded, exhausted, setEnabled },
  }
}

// Segmentation lives in lib/segments.ts — it is the TTS cache contract and is
// shared with the pre-warm script, which must split text identically.
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

type OfflineStatus = 'idle' | 'downloading' | 'ready' | 'error'

/**
 * Dictate speech in the target language. Calls `onTranscript` with the text so
 * the caller can FILL AN EDITABLE INPUT — we never auto-submit, so the user can
 * correct transcription noise before it is graded.
 *
 * Engine selection is native-first: the browser's Web Speech API is used when it
 * works (instant, no download). When it needs the network (desktop Chrome/Edge)
 * or the learner is offline, and they've opted into the on-device Vosk model, we
 * transparently switch to that (`lib/voskStt.ts`). Typing is always the fallback.
 */
export function useSTT(lang = 'fr-FR', onTranscript?: (text: string) => void) {
  const nativeSupported = useCapability(() => getRecognitionCtor() !== null)
  const offlineAvailable = useCapability(() => offlineSttAvailable(lang) && voskRuntimeSupported())
  const supported = nativeSupported || offlineAvailable

  const [listening, setListening] = useState(false)
  // 'network' means this device's native recogniser needs the internet (typical
  // on desktop Chrome/Edge — audio is transcribed server-side). Mobile engines
  // (Android/iOS) run on-device. Either way, offline Vosk or typing covers it.
  const [needsNetwork, setNeedsNetwork] = useState(false)
  const [usingOffline, setUsingOffline] = useState(false)
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('idle')
  const [offlineProgress, setOfflineProgress] = useState(0)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const sessionRef = useRef<VoskDictation | null>(null)
  const modelRef = useRef<Model | null>(null)
  const cbRef = useRef(onTranscript)
  const needsNetworkRef = useRef(false)
  const readyRef = useRef(false) // model archive is downloaded (offline-capable)

  useEffect(() => { cbRef.current = onTranscript }, [onTranscript])
  useEffect(() => { needsNetworkRef.current = needsNetwork }, [needsNetwork])

  // On language change, forget the loaded model and re-check whether this
  // language's model is already downloaded (all setState is in the async
  // continuation, never synchronously in the effect body).
  useEffect(() => {
    let cancelled = false
    modelRef.current = null
    readyRef.current = false
    const model = sttModelFor(lang)
    if (!offlineAvailable || !model) {
      Promise.resolve().then(() => {
        if (!cancelled) { setOfflineStatus('idle'); setOfflineProgress(0) }
      })
      return () => { cancelled = true }
    }
    isModelDownloaded(model).then((has) => {
      if (cancelled) return
      readyRef.current = has
      setOfflineStatus(has ? 'ready' : 'idle')
      setOfflineProgress(0)
    })
    return () => { cancelled = true }
  }, [lang, offlineAvailable])

  const startNative = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return false
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
    setUsingOffline(false)
    setListening(true)
    rec.start()
    return true
  }, [lang])

  const startOffline = useCallback(async () => {
    const model = sttModelFor(lang)
    if (!model) return
    // Never trigger the ~40 MB download implicitly from a mic tap — that only
    // happens via the explicit enableOffline() opt-in. Here we require the model
    // to be loaded, or its archive already cached (a fast, local load).
    if (!modelRef.current && !readyRef.current) return
    if (ttsCheck()) window.speechSynthesis.cancel()
    try {
      if (!modelRef.current) {
        setOfflineStatus('downloading')
        modelRef.current = await loadModel(model, (p) => setOfflineProgress(p))
        readyRef.current = true
        setOfflineStatus('ready')
      }
      const session = new VoskDictation()
      sessionRef.current = session
      setUsingOffline(true)
      setListening(true)
      await session.start(modelRef.current, (t) => cbRef.current?.(t))
    } catch {
      setOfflineStatus('error')
      setListening(false)
      setUsingOffline(false)
    }
  }, [lang])

  const start = useCallback(() => {
    const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine
    // Prefer on-device Vosk when the native engine can't work here (offline, or it
    // already failed with a network error) and we have the model cached.
    const preferOffline = offlineAvailable && readyRef.current && (offlineNow || needsNetworkRef.current)
    if (preferOffline) { void startOffline(); return }
    if (startNative()) return
    // No native engine at all — use Vosk if we can (may prompt a download first).
    if (offlineAvailable) void startOffline()
  }, [offlineAvailable, startNative, startOffline])

  const stop = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.stop()
      sessionRef.current = null
    }
    recRef.current?.stop()
    setListening(false)
  }, [])

  // Explicitly download + initialise the offline model (the "Enable offline
  // voice" affordance). Safe to call again to retry after an error.
  const enableOffline = useCallback(async () => {
    const model = sttModelFor(lang)
    if (!model) return
    setOfflineStatus('downloading')
    setOfflineProgress(0)
    try {
      modelRef.current = await loadModel(model, (p) => setOfflineProgress(p))
      readyRef.current = true
      setOfflineStatus('ready')
    } catch {
      setOfflineStatus('error')
    }
  }, [lang])

  return {
    supported,
    listening,
    needsNetwork,
    usingOffline,
    start,
    stop,
    offline: {
      available: offlineAvailable,
      status: offlineStatus,
      progress: offlineProgress,
      sizeMB: sttModelFor(lang)?.sizeMB ?? 0,
      enable: enableOffline,
    },
  }
}
