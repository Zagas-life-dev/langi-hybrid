import { describe, expect, it } from 'vitest'
import { judgeInstructions, parseVerdict } from '@/lib/hybrid/reviewCore'

describe('parseVerdict', () => {
  it('accepts with a reason on line 2', () => {
    expect(parseVerdict('ACCEPT\nSynonym of "car"')).toEqual({ accepted: true, reason: 'Synonym of "car"' })
  })
  it('rejects', () => {
    expect(parseVerdict('REJECT\nDifferent meaning').accepted).toBe(false)
  })
  it('handles inline reason and punctuation', () => {
    expect(parseVerdict('Accept: just a missing accent')).toEqual({ accepted: true, reason: 'just a missing accent' })
    expect(parseVerdict('REJECT - means house')).toEqual({ accepted: false, reason: 'means house' })
  })
  it('rejects anything unclear so the rules stand', () => {
    expect(parseVerdict('').accepted).toBe(false)
    expect(parseVerdict('Maybe? Hard to say.').accepted).toBe(false)
    expect(parseVerdict('ACCEPT or REJECT').accepted).toBe(false)
  })
})

describe('judgeInstructions', () => {
  it('describes each direction', () => {
    expect(judgeInstructions({ learningName: 'French', nativeName: 'English', direction: 'recognition' })).toContain('typed its meaning in English')
    expect(judgeInstructions({ learningName: 'French', nativeName: 'English', direction: 'production' })).toContain('the French word for it')
  })
})
