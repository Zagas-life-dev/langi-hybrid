'use client'
// The one door every AI call in Langi Hybrid goes through: Firebase AI Logic with a
// per-task inference mode, then a Hybrid HUD event for where it ran and what it saved.
import { getGenerativeModel, InferenceMode, type GenerativeModel, type Schema } from 'firebase/ai'
import { getHybridAI } from './firebase'
import { DEFAULT_RULES, estimateSaved, pickRoute, type HybridTask, type Mode, type TaskRule } from './tasks'
import { recordEvent, type HybridEvent, type Source } from './hud'

const MODE: Record<Mode, InferenceMode> = {
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
}

const LANGS = ['en', 'fr']
// gemini-4-hydrogen thinks for ~6 s even on one word, so give it room; lite answers in ~1 s.
const CLOUD_TIMEOUT_MS = 45_000

// Remote Config can replace these later (step: "Remote Config routing").
let rules: Record<HybridTask, TaskRule> = DEFAULT_RULES
let forceCloud = false
export function setRouting(next: { rules?: Record<HybridTask, TaskRule>; forceCloud?: boolean }) {
  if (next.rules) rules = next.rules
  if (next.forceCloud !== undefined) forceCloud = next.forceCloud
  models.clear()
}

const models = new Map<string, GenerativeModel>()

function modelFor(mode: Mode, cloudModel: string, schema?: Schema): GenerativeModel {
  const key = `${mode}|${cloudModel}|${schema ? JSON.stringify(schema) : ''}`
  let m = models.get(key)
  if (m) return m
  m = getGenerativeModel(getHybridAI(), {
    mode: MODE[mode],
    inCloudParams: {
      model: cloudModel,
      ...(schema ? { generationConfig: { responseMimeType: 'application/json', responseSchema: schema } } : {}),
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: LANGS }],
        expectedOutputs: [{ type: 'text', languages: LANGS }],
      },
      ...(schema ? { promptOptions: { responseConstraint: schema } } : {}),
    },
  }, { timeout: CLOUD_TIMEOUT_MS })
  models.set(key, m)
  return m
}

// --- On-device model status ------------------------------------------------

export type DeviceStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available'

interface PromptApi {
  availability(opts?: unknown): Promise<string>
}

/** Ask Chrome's Prompt API whether Gemini Nano can run here, for French + English. */
export async function deviceStatus(): Promise<DeviceStatus> {
  const LM = (globalThis as unknown as { LanguageModel?: PromptApi }).LanguageModel
  if (!LM) return 'unsupported'
  try {
    const s = await LM.availability({
      expectedInputs: [{ type: 'text', languages: LANGS }],
      expectedOutputs: [{ type: 'text', languages: LANGS }],
    })
    return (['unavailable', 'downloadable', 'downloading', 'available'].includes(s) ? s : 'unavailable') as DeviceStatus
  } catch {
    return 'unavailable'
  }
}

export interface DeviceDiagnostics {
  chrome: string | null
  hasPromptApi: boolean
  plain: string
  english: string
  french: string
}

/** Why Nano is or isn't usable: Chrome version, API presence, availability per language. */
export async function deviceDiagnostics(): Promise<DeviceDiagnostics> {
  const chrome = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? null
  const LM = (globalThis as unknown as { LanguageModel?: PromptApi }).LanguageModel
  if (!LM) return { chrome, hasPromptApi: false, plain: '-', english: '-', french: '-' }
  const check = (opts?: unknown) => LM.availability(opts).catch((e: Error) => `error: ${e.message}`)
  const lang = (l: string[]) => ({
    expectedInputs: [{ type: 'text', languages: l }],
    expectedOutputs: [{ type: 'text', languages: l }],
  })
  const [plain, english, french] = await Promise.all([check(), check(lang(['en'])), check(lang(['en', 'fr']))])
  return { chrome, hasPromptApi: true, plain, english, french }
}

let deviceReady = false

interface DownloadMonitor { addEventListener(type: 'downloadprogress', cb: (e: { loaded: number }) => void): void }
interface PromptApiCreate extends PromptApi {
  create(opts: { monitor?: (m: DownloadMonitor) => void } & Record<string, unknown>): Promise<{ destroy(): void }>
}

/**
 * Must be called synchronously from a click: Chrome only starts the Gemini Nano download
 * under a user gesture, so we call LanguageModel.create() before any await. The SDK's
 * initializeDeviceModel then attaches to the same download. Progress is 0..1.
 */
export function enableOnDevice(onProgress?: (fraction: number) => void): Promise<boolean> {
  const LM = (globalThis as unknown as { LanguageModel?: PromptApiCreate }).LanguageModel
  if (!LM) return Promise.reject(new Error('Prompt API not available in this browser'))
  const direct = LM.create({
    expectedInputs: [{ type: 'text', languages: LANGS }],
    expectedOutputs: [{ type: 'text', languages: LANGS }],
    monitor: (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(e.loaded)),
  }).then((s) => s.destroy())
  const viaSdk = modelFor('prefer_on_device', DEFAULT_RULES.explain.cloudModel).initializeDeviceModel()
  return Promise.all([direct, viaSdk]).then(async () => {
    deviceReady = (await deviceStatus()) === 'available'
    return deviceReady
  })
}

/**
 * Loads Nano into memory with a 1-token prompt so the first real call is not the slow one.
 * The SDK keeps the last session alive, which keeps the model loaded.
 */
let warmed = false
export async function warmUpDevice(): Promise<number | null> {
  if (warmed || (await deviceStatus()) !== 'available') return null
  warmed = true
  const t0 = performance.now()
  try {
    await modelFor('only_on_device', DEFAULT_RULES.liveCorrect.cloudModel).generateContent('Reply: ok')
  } catch {
    warmed = false
    return null
  }
  return Math.round(performance.now() - t0)
}

// --- Main entry ------------------------------------------------------------

export interface HybridResult<T = string> {
  text: string
  data: T | null
  source: Source
  event: HybridEvent
  /** ms until the first streamed text arrived (null when not streaming). What the user feels. */
  firstTokenMs: number | null
}

export interface RunOpts {
  /** Prepended to the prompt. On-device is single-turn, so there is no chat history API. */
  instructions?: string
  schema?: Schema
  /** Debug: pin the route to Nano so a failure throws the real error instead of falling back to cloud. */
  nanoOnly?: boolean
  /** Stream: called with the full text so far each time a chunk arrives. */
  onText?: (soFar: string) => void
}

export async function runTask<T = string>(task: HybridTask, prompt: string, opts: RunOpts = {}): Promise<HybridResult<T>> {
  const full = opts.instructions ? `${opts.instructions}\n\n${prompt}` : prompt
  if (!deviceReady) deviceReady = (await deviceStatus()) === 'available'
  const route = opts.nanoOnly
    ? { mode: 'only_on_device' as Mode, cloudModel: rules[task].cloudModel, reason: 'Nano-only debug run' }
    : pickRoute({ task, inputChars: full.length, online: navigator.onLine, deviceReady, forceCloud, rules })

  const t0 = performance.now()
  const model = modelFor(route.mode, route.cloudModel, opts.schema)
  let firstTokenMs: number | null = null
  let res: { response: { text(): string } }
  if (opts.onText) {
    const streamed = await model.generateContentStream(full)
    let soFar = ''
    for await (const chunk of streamed.stream) {
      soFar += chunk.text()
      if (firstTokenMs === null && soFar) firstTokenMs = Math.round(performance.now() - t0)
      opts.onText(soFar)
    }
    res = { response: await streamed.response }
  } else {
    res = await model.generateContent(full)
  }
  const ms = Math.round(performance.now() - t0)
  const text = res.response.text()
  // The SDK's enum values are lowercase ('on_device' / 'in_cloud'); the HUD uses uppercase.
  const raw = (res.response as { inferenceSource?: string }).inferenceSource
  const source: Source = raw
    ? (raw.toLowerCase() === 'on_device' ? 'ON_DEVICE' : 'IN_CLOUD')
    : (route.mode.startsWith('only_on') ? 'ON_DEVICE' : 'IN_CLOUD')

  let data: T | null = null
  if (opts.schema) {
    try { data = JSON.parse(text) as T } catch { data = null }
  }

  const saved = estimateSaved(full.length, text.length)
  const reason = source === 'IN_CLOUD' && route.mode === 'prefer_on_device' && deviceReady
    ? 'On-device failed: cloud fallback'
    : route.reason
  const event = recordEvent({ task, source, reason, ms, savedBytes: saved.bytes, savedUsd: saved.usd })
  return { text, data, source, event, firstTokenMs }
}
