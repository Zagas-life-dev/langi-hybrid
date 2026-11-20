// Pure routing rules for Langi Hybrid. No Firebase imports here so it can be unit-tested
// and later overridden by Remote Config values.

export type HybridTask = 'liveCorrect' | 'explain' | 'grade' | 'deepDive' | 'chat' | 'classify'

/** Mirrors firebase/ai InferenceMode string values. */
export type Mode = 'prefer_on_device' | 'only_on_device' | 'prefer_in_cloud' | 'only_in_cloud'

export interface TaskRule {
  mode: Mode
  /** Mode to use when the browser reports it is offline. */
  offlineMode: Mode
  cloudModel: string
  /** Inputs longer than this skip the on-device model. */
  maxOnDeviceChars: number
  /** Why this route was chosen, shown in the Hybrid HUD. */
  why: string
}

// gemini-3.8-flash hung (>40 s, no response) on Nov 18 tests, so quick tasks fall back to lite.
export const MODELS = {
  flash: 'gemini-3.5-flash-lite',
  best: 'gemini-4-hydrogen',
  lite: 'gemini-3.5-flash-lite',
} as const

export const DEFAULT_RULES: Record<HybridTask, TaskRule> = {
  liveCorrect: {
    mode: 'prefer_on_device', offlineMode: 'only_on_device', cloudModel: MODELS.flash,
    maxOnDeviceChars: 600, why: 'Runs on every typing pause: must be instant and free',
  },
  explain: {
    mode: 'prefer_on_device', offlineMode: 'only_on_device', cloudModel: MODELS.flash,
    maxOnDeviceChars: 400, why: 'Short input, short output, very frequent',
  },
  grade: {
    mode: 'prefer_on_device', offlineMode: 'only_on_device', cloudModel: MODELS.flash,
    maxOnDeviceChars: 800, why: 'Private, quick, must work with no connection',
  },
  deepDive: {
    mode: 'prefer_in_cloud', offlineMode: 'only_on_device', cloudModel: MODELS.best,
    maxOnDeviceChars: 1500, why: 'Long structured answer: quality beats speed',
  },
  chat: {
    // Lite, not hydrogen: hydrogen took 6 s+ per turn on Nov 19, too slow for a live chat.
    mode: 'prefer_in_cloud', offlineMode: 'only_on_device', cloudModel: MODELS.lite,
    maxOnDeviceChars: 6000, why: 'Multi-turn quality in the cloud, still works offline',
  },
  classify: {
    mode: 'prefer_on_device', offlineMode: 'only_on_device', cloudModel: MODELS.lite,
    maxOnDeviceChars: 400, why: 'Tiny label task',
  },
}

/** Languages Gemini Nano is set up for here. Anything else (Yoruba, Igbo, Hausa...) goes to the cloud. */
export const NANO_LANGS = ['en', 'fr']

export interface RouteInput {
  task: HybridTask
  inputChars: number
  online: boolean
  deviceReady: boolean
  /** The language being learned: on-device only runs when Nano supports it. */
  targetLang?: string
  forceCloud?: boolean
  rules?: Record<HybridTask, TaskRule>
}

export interface Route { mode: Mode; cloudModel: string; reason: string }

/** Decide the inference mode for one call. */
export function pickRoute(i: RouteInput): Route {
  const rule = (i.rules ?? DEFAULT_RULES)[i.task]
  if (!i.online) {
    return { mode: rule.offlineMode, cloudModel: rule.cloudModel, reason: 'Offline: on-device only' }
  }
  if (i.forceCloud) {
    return { mode: 'only_in_cloud', cloudModel: rule.cloudModel, reason: 'Cloud forced by config' }
  }
  if (i.targetLang && !NANO_LANGS.includes(i.targetLang) && rule.mode.includes('on_device')) {
    return { mode: 'only_in_cloud', cloudModel: rule.cloudModel, reason: 'On-device AI does not support this language yet: cloud' }
  }
  if (i.inputChars > rule.maxOnDeviceChars && rule.mode.includes('on_device')) {
    return { mode: 'prefer_in_cloud', cloudModel: rule.cloudModel, reason: `Input over ${rule.maxOnDeviceChars} chars: cloud` }
  }
  if (!i.deviceReady && rule.mode === 'prefer_on_device') {
    return { mode: rule.mode, cloudModel: rule.cloudModel, reason: 'On-device model not ready: cloud fallback' }
  }
  return { mode: rule.mode, cloudModel: rule.cloudModel, reason: rule.why }
}

// --- HUD savings estimate ---------------------------------------------------
// A cloud call costs request + response bytes plus HTTP/TLS overhead, and tokens.
const HTTP_OVERHEAD_BYTES = 1800
const USD_PER_1K_CHARS = 0.0001 // rough Flash pricing at ~4 chars/token

export function estimateSaved(promptChars: number, outputChars: number) {
  const bytes = promptChars + outputChars + HTTP_OVERHEAD_BYTES
  const usd = ((promptChars + outputChars) / 1000) * USD_PER_1K_CHARS
  return { bytes, usd }
}

// --- Correction format -------------------------------------------------------
// Nano is fastest with plain text, so liveCorrect asks for: line 1 = corrected sentence,
// then "wrong -> right (reason)" per mistake, or just "OK". This turns that back into the
// same shape the platform already renders ({ corrected, mistakes }).

export interface Mistake { wrong: string; right: string; why: string }
export interface Correction { corrected: string; mistakes: Mistake[] }

export function parseCorrection(text: string, original: string): Correction {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0 || /^ok\.?$/i.test(lines[0])) return { corrected: original, mistakes: [] }
  const [corrected, ...rest] = lines
  const mistakes: Mistake[] = []
  for (const line of rest) {
    const m = line.match(/^[-*•\s]*(.+?)\s*(?:->|→)\s*(.+?)(?:\s*\((.*)\))?$/)
    if (!m) continue
    const wrong = m[1].trim()
    const right = m[2].trim()
    if (wrong.toLowerCase() === right.toLowerCase()) continue // Nano sometimes "fixes" nothing
    mistakes.push({ wrong, right, why: (m[3] ?? '').trim() })
  }
  return { corrected, mistakes }
}
