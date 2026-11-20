// Pure parsing of the Remote Config routing parameters (no Firebase imports, unit-testable).
// Four parameters tune where each AI task runs without a redeploy:
//   force_cloud          "true" sends every task to the cloud (kill switch for a bad on-device model)
//   show_hud             "false" hides the Hybrid HUD counter
//   on_device_tasks      comma list of tasks allowed to run on-device first
//   max_on_device_chars  JSON { task: n }: longer inputs skip the on-device model
import { DEFAULT_RULES, type HybridTask, type TaskRule } from './tasks'

export const TASKS = Object.keys(DEFAULT_RULES) as HybridTask[]

const isOnDeviceMode = (m: TaskRule['mode']) => m === 'prefer_on_device' || m === 'only_on_device'

/** Defaults baked into the app: used until a fetch succeeds, and when offline for the first time. */
export const PARAM_DEFAULTS: Record<string, string> = {
  force_cloud: 'false',
  show_hud: 'true',
  on_device_tasks: TASKS.filter((t) => isOnDeviceMode(DEFAULT_RULES[t].mode)).join(','),
  max_on_device_chars: JSON.stringify(Object.fromEntries(TASKS.map((t) => [t, DEFAULT_RULES[t].maxOnDeviceChars]))),
}

export interface RoutingConfig {
  rules: Record<HybridTask, TaskRule>
  forceCloud: boolean
  showHud: boolean
}

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : /^(true|1|yes|on)$/i.test(v.trim()) ? true : /^(false|0|no|off)$/i.test(v.trim()) ? false : fallback

/** Turn raw parameter strings into routing rules. Bad input falls back to the defaults, never throws. */
export function parseRouting(values: Partial<Record<string, string>> = {}): RoutingConfig {
  const v = { ...PARAM_DEFAULTS, ...Object.fromEntries(Object.entries(values).filter(([, x]) => typeof x === 'string')) } as Record<string, string>

  const allowed = new Set(v.on_device_tasks.split(',').map((s) => s.trim()).filter(Boolean))

  let chars: Record<string, unknown> = {}
  try {
    const j = JSON.parse(v.max_on_device_chars)
    if (j && typeof j === 'object' && !Array.isArray(j)) chars = j
  } catch { /* keep defaults */ }

  const rules = {} as Record<HybridTask, TaskRule>
  for (const t of TASKS) {
    const base = DEFAULT_RULES[t]
    const n = Number(chars[t])
    const maxOnDeviceChars = Number.isFinite(n) && n >= 0 && n <= 20000 ? Math.round(n) : base.maxOnDeviceChars
    const want = allowed.has(t)
    const wasOn = isOnDeviceMode(base.mode)
    if (want === wasOn) {
      rules[t] = { ...base, maxOnDeviceChars }
    } else if (want) {
      rules[t] = { ...base, mode: 'prefer_on_device', maxOnDeviceChars, why: 'Set to run on-device first by Remote Config' }
    } else {
      rules[t] = { ...base, mode: 'prefer_in_cloud', maxOnDeviceChars, why: 'Set to run in the cloud first by Remote Config' }
    }
  }
  return { rules, forceCloud: bool(v.force_cloud, false), showHud: bool(v.show_hud, true) }
}
