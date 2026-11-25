import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { getCatalog } from '@/lib/grammar'
import { normalizeAnswer } from '@/lib/srs-core'

type Lesson = { slug: string; examples: unknown[]; drills: { prompt: string; answer: string }[] }

describe('Nigerian-language grammar', () => {
  for (const lang of ['yo', 'ig', 'ha']) {
    it(`${lang}: every catalog topic has a lesson with examples and drills`, () => {
      const data: { lessons: Lesson[] } = JSON.parse(readFileSync(`data/grammar-ng/${lang}.json`, 'utf8'))
      const slugs = data.lessons.map((l) => l.slug)
      expect(slugs).toEqual(getCatalog(lang).map((t) => t.slug))
      for (const l of data.lessons) {
        expect(l.examples.length).toBeGreaterThanOrEqual(4)
        expect(l.drills.length).toBeGreaterThanOrEqual(5)
        for (const d of l.drills) {
          expect(d.prompt).toContain('___')
          expect(d.answer.trim()).not.toBe('')
          // The cue must not give the answer away verbatim.
          expect(d.prompt.replace('___', '')).not.toContain(` ${d.answer} `)
        }
      }
    })
  }
  it('lenient answers accept plain letters for tone marks, underdots and Hausa hooked letters', () => {
    expect(normalizeAnswer('Ṣé', 'lenient')).toBe(normalizeAnswer('se', 'lenient'))
    expect(normalizeAnswer('mẹ́ta', 'lenient')).toBe(normalizeAnswer('meta', 'lenient'))
    expect(normalizeAnswer('ƙaramar', 'lenient')).toBe(normalizeAnswer('karamar', 'lenient'))
    expect(normalizeAnswer('ɗaki', 'lenient')).toBe(normalizeAnswer('daki', 'lenient'))
  })
})
