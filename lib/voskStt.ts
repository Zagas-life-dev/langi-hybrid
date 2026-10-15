'use client'
// ---------------------------------------------------------------------------
// On-device speech-to-text via Vosk (vosk-browser, Kaldi compiled to WASM). This
// is the OFFLINE fallback for dictation: the native Web Speech API needs the
// network on desktop Chrome/Edge, so when the learner opts in we download a ~40 MB
// small model for their active language, cache it for good, and run recognition
// entirely on the device — in a Web Worker, so the UI never blocks.
//
// vosk-browser is heavy and browser-only (Worker + WASM + AudioContext), so it's
// dynamically imported: nothing ships in the main bundle until the learner
// actually enables offline voice.
// ---------------------------------------------------------------------------
import type { Model } from 'vosk-browser'
import { sttModelUrl, type SttModel } from '@/lib/sttModels'

const STT_CACHE = 'langi-stt-v1'

/** Everything Vosk needs to run in this browser. */
export function voskRuntimeSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  )
}

/** Has this model already been downloaded (so offline dictation is ready now)? */
export async function isModelDownloaded(model: SttModel): Promise<boolean> {
  try {
    const cache = await caches.open(STT_CACHE)
    return !!(await cache.match(sttModelUrl(model)))
  } catch {
    return false
  }
}

// Download the archive with progress, persist it for offline reuse, and hand the
// bytes to Vosk via an in-memory blob URL (so we never fetch the 40 MB twice).
async function fetchModelBlob(model: SttModel, onProgress?: (p: number) => void): Promise<Blob> {
  const url = sttModelUrl(model)
  const cache = await caches.open(STT_CACHE).catch(() => null)
  const cached = cache ? await cache.match(url) : null
  if (cached) {
    onProgress?.(1)
    return cached.blob()
  }

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || model.sizeMB * 1024 * 1024
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress?.(Math.min(0.99, received / total))
  }
  const blob = new Blob(chunks as BlobPart[], { type: 'application/gzip' })
  // Persist for offline: a fresh Response, since a Blob's stream is one-shot.
  await cache?.put(url, new Response(blob.slice(0, blob.size, blob.type))).catch(() => {})
  onProgress?.(1)
  return blob
}

// One Model (worker + loaded weights) per language URL, memoized for the session.
const modelCache = new Map<string, Promise<Model>>()

export function loadModel(model: SttModel, onProgress?: (p: number) => void): Promise<Model> {
  const url = sttModelUrl(model)
  const existing = modelCache.get(url)
  if (existing) return existing
  const p = (async () => {
    const blob = await fetchModelBlob(model, onProgress)
    const objUrl = URL.createObjectURL(blob)
    try {
      const { createModel } = await import('vosk-browser')
      return await createModel(objUrl)
    } finally {
      // Weights are loaded into the worker by now; the blob URL is no longer needed.
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000)
    }
  })()
  modelCache.set(url, p)
  p.catch(() => modelCache.delete(url)) // let a failed load be retried
  return p
}

// Just the recognizer surface we use (vosk-browser types it as an anonymous class).
interface Recognizer {
  on(event: 'result' | 'partialresult' | 'error', cb: (m: { result?: { text?: string }; error?: string }) => void): void
  acceptWaveform(buffer: AudioBuffer): void
  retrieveFinalResult?: () => void
  remove?: () => void
}

/** A single live dictation session: mic → Vosk → onText(final transcript). */
export class VoskDictation {
  private ctx?: AudioContext
  private stream?: MediaStream
  private source?: MediaStreamAudioSourceNode
  private processor?: ScriptProcessorNode
  private recognizer?: Recognizer

  async start(model: Model, onText: (t: string) => void, onError?: (e: string) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    const rec = new model.KaldiRecognizer(this.ctx.sampleRate) as unknown as Recognizer
    rec.on('result', (m) => {
      const t = m.result?.text?.trim()
      if (t) onText(t)
    })
    rec.on('error', (m) => onError?.(m.error || 'recognition error'))
    this.recognizer = rec

    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      try {
        rec.acceptWaveform(e.inputBuffer)
      } catch {
        /* worker not ready between frames — drop the frame */
      }
    }
    this.source.connect(this.processor)
    // Route through a silent gain node so the audio graph keeps pulling frames
    // without the mic being played back through the speakers.
    const sink = this.ctx.createGain()
    sink.gain.value = 0
    this.processor.connect(sink)
    sink.connect(this.ctx.destination)
  }

  stop(): void {
    try {
      this.recognizer?.retrieveFinalResult?.()
    } catch {}
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => {})
    try {
      this.recognizer?.remove?.()
    } catch {}
    this.recognizer = undefined
    this.ctx = undefined
    this.stream = undefined
  }
}
