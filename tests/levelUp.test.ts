import { describe, it, expect } from 'vitest'
import { nextLevel, scoreLevelUp } from '@/lib/levelUpCore'

const r = (section: 'grammar' | 'vocab', n: number, correct: number) =>
  Array.from({ length: n }, (_, i) => ({ section, correct: i < correct }))

describe('nextLevel', () => {
  it('steps up one CEFR level', () => expect(nextLevel('A2')).toBe('B1'))
  it('has nothing above C2', () => expect(nextLevel('C2')).toBeNull())
  it('needs a level to start from', () => expect(nextLevel(null)).toBeNull())
})

describe('scoreLevelUp', () => {
  it('passes a strong, balanced attempt', () => {
    const v = scoreLevelUp([...r('grammar', 8, 6), ...r('vocab', 8, 7)])
    expect(v.passed).toBe(true)
    expect(v.overall).toBeCloseTo(13 / 16)
  })

  it('fails when one section is weak even if overall is high', () => {
    const v = scoreLevelUp([...r('grammar', 8, 4), ...r('vocab', 8, 8)]) // 75% overall, grammar 50%
    expect(v.passed).toBe(false)
  })

  it('fails below the overall bar', () => {
    expect(scoreLevelUp([...r('grammar', 8, 5), ...r('vocab', 8, 5)]).passed).toBe(false)
  })

  it('never passes an empty submission', () => {
    expect(scoreLevelUp([]).passed).toBe(false)
  })
})
