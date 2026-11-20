import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '@/lib/hybrid/tasks'
import { PARAM_DEFAULTS, parseRouting } from '@/lib/hybrid/remoteCore'

describe('parseRouting', () => {
  it('with no values it equals the built-in defaults', () => {
    const r = parseRouting()
    expect(r.forceCloud).toBe(false)
    expect(r.showHud).toBe(true)
    for (const t of Object.keys(DEFAULT_RULES) as (keyof typeof DEFAULT_RULES)[]) {
      expect(r.rules[t].mode).toBe(DEFAULT_RULES[t].mode)
      expect(r.rules[t].maxOnDeviceChars).toBe(DEFAULT_RULES[t].maxOnDeviceChars)
    }
  })

  it('the default task list is the on-device tasks', () => {
    expect(PARAM_DEFAULTS.on_device_tasks.split(',').sort()).toEqual(['classify', 'explain', 'grade', 'liveCorrect'])
  })

  it('force_cloud and show_hud switches', () => {
    expect(parseRouting({ force_cloud: 'true' }).forceCloud).toBe(true)
    expect(parseRouting({ force_cloud: ' ON ' }).forceCloud).toBe(true)
    expect(parseRouting({ show_hud: 'false' }).showHud).toBe(false)
    expect(parseRouting({ show_hud: 'maybe' }).showHud).toBe(true)
  })

  it('removing a task from on_device_tasks sends it to the cloud first', () => {
    const r = parseRouting({ on_device_tasks: 'liveCorrect,grade,classify' })
    expect(r.rules.explain.mode).toBe('prefer_in_cloud')
    expect(r.rules.explain.why).toContain('Remote Config')
    expect(r.rules.liveCorrect.mode).toBe('prefer_on_device')
  })

  it('adding chat to on_device_tasks moves chat on-device first', () => {
    const r = parseRouting({ on_device_tasks: 'liveCorrect,explain,grade,classify,chat' })
    expect(r.rules.chat.mode).toBe('prefer_on_device')
    expect(r.rules.deepDive.mode).toBe('prefer_in_cloud')
  })

  it('overrides the size threshold per task and ignores bad numbers', () => {
    const r = parseRouting({ max_on_device_chars: JSON.stringify({ liveCorrect: 150, explain: -5, grade: 'big' }) })
    expect(r.rules.liveCorrect.maxOnDeviceChars).toBe(150)
    expect(r.rules.explain.maxOnDeviceChars).toBe(DEFAULT_RULES.explain.maxOnDeviceChars)
    expect(r.rules.grade.maxOnDeviceChars).toBe(DEFAULT_RULES.grade.maxOnDeviceChars)
  })

  it('survives invalid JSON and junk', () => {
    const r = parseRouting({ max_on_device_chars: '{nope', on_device_tasks: '' })
    expect(r.rules.liveCorrect.maxOnDeviceChars).toBe(DEFAULT_RULES.liveCorrect.maxOnDeviceChars)
    // An empty list means "nothing on-device": every on-device task goes cloud first.
    expect(r.rules.liveCorrect.mode).toBe('prefer_in_cloud')
  })

  it('offline mode is never changed by config', () => {
    const r = parseRouting({ on_device_tasks: '' })
    expect(r.rules.liveCorrect.offlineMode).toBe('only_on_device')
  })
})
