import { describe, it, expect } from 'vitest'
import { newlyUnlocked, type AchievementStats } from '@/lib/achievements'

const zero: AchievementStats = {
  streak: 0, xp: 0, totalReviews: 0, mastered: 0, goalMetDays: 0, sentences: 0, grammarLessons: 0, mistakesResolved: 0,
}

describe('newlyUnlocked', () => {
  it('unlocks nothing for a brand-new learner', () => {
    expect(newlyUnlocked(zero, new Set())).toEqual([])
  })

  it('unlocks the first-review badge once', () => {
    const ids = newlyUnlocked({ ...zero, totalReviews: 1 }, new Set()).map((a) => a.id)
    expect(ids).toEqual(['first-steps'])
    expect(newlyUnlocked({ ...zero, totalReviews: 1 }, new Set(ids))).toEqual([])
  })

  it('unlocks every streak tier reached at once', () => {
    const ids = newlyUnlocked({ ...zero, streak: 30 }, new Set()).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['streak-3', 'streak-7', 'streak-30']))
    expect(ids).not.toContain('streak-100')
  })
})
