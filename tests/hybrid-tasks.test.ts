import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, estimateSaved, parseCorrection, pickRoute } from '@/lib/hybrid/tasks'

describe('pickRoute', () => {
  it('uses the task rule when online and short', () => {
    const r = pickRoute({ task: 'liveCorrect', inputChars: 40, online: true, deviceReady: true })
    expect(r.mode).toBe('prefer_on_device')
    expect(r.reason).toBe(DEFAULT_RULES.liveCorrect.why)
  })

  it('goes on-device only when offline, even for cloud tasks', () => {
    expect(pickRoute({ task: 'chat', inputChars: 40, online: false, deviceReady: true }).mode).toBe('only_on_device')
  })

  it('sends long input to the cloud', () => {
    const r = pickRoute({ task: 'explain', inputChars: 5000, online: true, deviceReady: true })
    expect(r.mode).toBe('prefer_in_cloud')
  })

  it('honours the forced-cloud switch when online', () => {
    expect(pickRoute({ task: 'grade', inputChars: 10, online: true, deviceReady: true, forceCloud: true }).mode).toBe('only_in_cloud')
  })

  it('keeps cloud tasks in the cloud', () => {
    expect(pickRoute({ task: 'deepDive', inputChars: 100, online: true, deviceReady: true }).mode).toBe('prefer_in_cloud')
  })
})

describe('estimateSaved', () => {
  it('counts prompt, output and HTTP overhead', () => {
    const s = estimateSaved(100, 200)
    expect(s.bytes).toBe(2100)
    expect(s.usd).toBeGreaterThan(0)
  })
})

describe('parseCorrection', () => {
  it('parses corrected line and mistakes', () => {
    const r = parseCorrection("Je suis allé au marché hier et j'ai acheté des pommes.\nj'achète -> j'ai acheté (past tense)", 'x')
    expect(r.corrected).toBe("Je suis allé au marché hier et j'ai acheté des pommes.")
    expect(r.mistakes).toEqual([{ wrong: "j'achète", right: "j'ai acheté", why: 'past tense' }])
  })

  it('treats OK as no mistakes and keeps the original', () => {
    expect(parseCorrection('OK', 'Bonjour')).toEqual({ corrected: 'Bonjour', mistakes: [] })
  })

  it('drops no-op mistakes where wrong equals right', () => {
    expect(parseCorrection('Salut\nachète -> achète (conjugation)', 'x').mistakes).toEqual([])
  })
})
