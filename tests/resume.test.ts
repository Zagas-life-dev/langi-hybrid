import { describe, it, expect } from 'vitest'
import { resumePoint, watchProgress, parseTimestamp } from '@/lib/resume'

describe('resumePoint', () => {
  it('resumes from a mid-video position', () => {
    expect(resumePoint(222.7, 600)).toBe(222)
  })
  it('starts over when barely started or nearly finished', () => {
    expect(resumePoint(5, 600)).toBeUndefined()
    expect(resumePoint(590, 600)).toBeUndefined()
    expect(resumePoint(0, 600)).toBeUndefined()
    expect(resumePoint(undefined, undefined)).toBeUndefined()
  })
})

describe('watchProgress', () => {
  it('is the watched fraction only when there is something to resume', () => {
    expect(watchProgress(300, 600)).toBe(0.5)
    expect(watchProgress(3, 600)).toBeUndefined()
    expect(watchProgress(300, 0)).toBeUndefined()
  })
})

describe('parseTimestamp', () => {
  it('reads every form YouTube links use', () => {
    expect(parseTimestamp('302')).toBe(302)
    expect(parseTimestamp('1702s')).toBe(1702)
    expect(parseTimestamp('5m2s')).toBe(302)
    expect(parseTimestamp('1h2m3s')).toBe(3723)
    expect(parseTimestamp('28:22')).toBe(1702)
    expect(parseTimestamp('1:02:03')).toBe(3723)
  })
  it('rejects junk', () => {
    expect(parseTimestamp('abc')).toBeUndefined()
    expect(parseTimestamp('')).toBeUndefined()
    expect(parseTimestamp(undefined)).toBeUndefined()
  })
})
