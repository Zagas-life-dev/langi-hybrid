import { describe, it, expect } from 'vitest'
import { scorePronunciation, tokenize, wordSimilarity } from '@/lib/pronunciation'

describe('tokenize', () => {
  it('splits elisions and strips accents/punctuation', () => {
    expect(tokenize("J'ai mangé, déjà !")).toEqual(['j', 'ai', 'mange', 'deja'])
  })
})

describe('wordSimilarity', () => {
  it('is 1 for identical words', () => expect(wordSimilarity('bonjour', 'bonjour')).toBe(1))
  it('is high for a one-letter slip', () => expect(wordSimilarity('bonjour', 'bonjours')).toBeGreaterThan(0.85))
  it('is 0 against an empty word', () => expect(wordSimilarity('chat', '')).toBe(0))
})

describe('scorePronunciation', () => {
  it('scores a perfect read-back 100', () => {
    const r = scorePronunciation('Je suis content.', 'je suis content')
    expect(r.score).toBe(100)
    expect(r.verdict).toBe('great')
    expect(r.words.every((w) => w.status === 'correct')).toBe(true)
  })

  it('flags a missing word as wrong and lowers the score', () => {
    const r = scorePronunciation('Je suis très content', 'je suis content')
    expect(r.words[2]).toMatchObject({ text: 'très', status: 'wrong' })
    expect(r.score).toBe(75)
  })

  it('collects extra words the learner added', () => {
    const r = scorePronunciation('bonjour', 'euh bonjour')
    expect(r.extras).toEqual(['euh'])
  })

  it('scores silence as 0', () => {
    expect(scorePronunciation('bonjour madame', '').score).toBe(0)
  })
})
