import { describe, it, expect } from 'vitest'
import { tokenKeys, textKeys, variants, isFunctionWord, vocabProfile, coverageOf, type WordStatus } from '@/lib/wordsCore'

describe('tokenKeys', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenKeys('Bonjour,')).toEqual(['bonjour'])
    expect(tokenKeys('«Café»')).toEqual(['café'])
  })
  it('drops elided prefixes but keeps aujourd’hui whole', () => {
    expect(tokenKeys("l'homme")).toEqual(['homme'])
    expect(tokenKeys('qu’il')).toEqual(['il'])
    expect(tokenKeys("aujourd'hui")).toEqual(["aujourd'hui"])
  })
  it('splits hyphen compounds and drops numbers', () => {
    expect(tokenKeys('Est-ce')).toEqual(['est', 'ce'])
    expect(tokenKeys('2024')).toEqual([])
  })
})

describe('textKeys', () => {
  it('skips capitalised names mid-sentence but not sentence starts', () => {
    expect(textKeys('Marie habite à Paris. Elle aime')).toEqual(['marie', 'habite', 'à', 'elle', 'aime'])
  })
})

describe('variants', () => {
  it('guesses singular and masculine forms', () => {
    expect(variants('grandes')).toEqual(['grandes', 'grande', 'grand'])
    expect(variants('les')).toEqual(['les'])
  })
})

describe('coverage', () => {
  it('weights by frequency and counts learning words half', () => {
    const { vocab, total } = vocabProfile(['le chat le chien', 'le chat'])
    expect(total).toBe(6)
    expect(vocab[0]).toEqual({ w: 'le', n: 3 })
    const status = (w: string): WordStatus => (isFunctionWord('fr', w) ? 'known' : w === 'chat' ? 'learning' : 'new')
    const c = coverageOf(vocab, status)
    expect(c.coverage).toBeCloseTo((3 + 1) / 6)
    expect(c.newWords).toBe(1)
  })
})
