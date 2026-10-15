import { describe, it, expect } from 'vitest'
import { rankRows, publicName, makeFriendCode, normalizeFriendCode } from '@/lib/leagueCore'

describe('rankRows', () => {
  it('ranks by XP and shares ranks on ties', () => {
    const ranked = rankRows([
      { userId: 'a', name: 'Ana', xp: 50, isMe: false },
      { userId: 'b', name: 'Ben', xp: 120, isMe: true },
      { userId: 'c', name: 'Cy', xp: 50, isMe: false },
      { userId: 'd', name: 'Di', xp: 10, isMe: false },
    ])
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([['Ben', 1], ['Ana', 2], ['Cy', 2], ['Di', 4]])
  })
})

describe('publicName', () => {
  it('uses the display name', () => expect(publicName('Kachi', 'abc123')).toBe('Kachi'))
  it('falls back to an anonymous handle, never an email', () => {
    expect(publicName('', '65f0c0ffee12ab34')).toBe('Learner AB34')
  })
})

describe('friend codes', () => {
  it('are 6 unambiguous characters', () => {
    const code = makeFriendCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
  it('normalizes what people type', () => expect(normalizeFriendCode(' k7q-m2x ')).toBe('K7QM2X'))
})
