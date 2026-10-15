import { describe, it, expect } from 'vitest'
import { weekDateKeys, summarizeWeek, digestMessage } from '@/lib/weekly'

describe('weekDateKeys', () => {
  it('returns Monday..Sunday of the current week', () => {
    // Wed 2026-09-30
    expect(weekDateKeys(new Date(2026, 8, 30))).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })
  it('treats Sunday as the end of the week, not the start', () => {
    expect(weekDateKeys(new Date(2026, 9, 4))[0]).toBe('2026-09-28')
  })
  it('can look back a week', () => {
    expect(weekDateKeys(new Date(2026, 8, 30), 1)[0]).toBe('2026-09-21')
  })
})

describe('summarizeWeek + digestMessage', () => {
  const week = summarizeWeek([
    { date: 'a', xp: 50, reviews: 20, correct: 15, goalMet: true, chats: 1 },
    { date: 'b', xp: 30, reviews: 10, correct: 9, videos: 2 },
    { date: 'c', xp: 0 },
  ])

  it('rolls up totals', () => {
    expect(week).toMatchObject({ xp: 80, activeDays: 2, goalDays: 1, cards: 30, speaking: 1, videos: 2 })
    expect(week.accuracy).toBeCloseTo(24 / 30)
  })

  it('compares with last week', () => {
    const msg = digestMessage(week, summarizeWeek([{ date: 'x', xp: 60 }]))
    expect(msg.title).toContain('80 XP (+20 vs last week)')
    expect(msg.body).toContain('2/7 days active')
    expect(msg.body).toContain('80% accuracy')
  })

  it('nudges gently after an empty week', () => {
    expect(digestMessage(summarizeWeek([]), summarizeWeek([])).title).toMatch(/fresh week/)
  })
})
