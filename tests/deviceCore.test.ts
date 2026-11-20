import { describe, expect, it } from 'vitest'
import { deviceNotice, MIN_CHROME } from '@/lib/hybrid/deviceCore'

describe('deviceNotice', () => {
  it('shows nothing while checking or when Nano is ready', () => {
    expect(deviceNotice('checking').kind).toBe('ready')
    expect(deviceNotice('available').kind).toBe('ready')
  })

  it('offers the one-time download when Nano can be downloaded', () => {
    expect(deviceNotice('downloadable').kind).toBe('enable')
    expect(deviceNotice('downloading').kind).toBe('enable')
  })

  it('explains cloud-only mode for an old Chrome', () => {
    const n = deviceNotice('unsupported', { chrome: '120', hasPromptApi: false })
    expect(n.kind).toBe('cloud')
    expect(n.body).toContain('version 120')
    expect(n.body).toContain(String(MIN_CHROME))
  })

  it('explains cloud-only mode for a non-Chrome browser', () => {
    const n = deviceNotice('unsupported', { chrome: null, hasPromptApi: false })
    expect(n.body).toContain('Use Chrome')
  })

  it('explains hardware limits when the API exists but the model is unavailable', () => {
    const n = deviceNotice('unavailable', { chrome: '140', hasPromptApi: true })
    expect(n.kind).toBe('cloud')
    expect(n.body).toContain('22 GB')
  })

  it('still produces a message with no diagnostics', () => {
    expect(deviceNotice('unsupported').kind).toBe('cloud')
  })
})
