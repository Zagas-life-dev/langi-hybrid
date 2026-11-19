import { describe, expect, it } from 'vitest'
import { highlight, parseCorrection } from '@/lib/hybrid/correctCore'

describe('parseCorrection', () => {
  it('treats OK as correct', () => {
    expect(parseCorrection('OK', 'Bonjour').ok).toBe(true)
    expect(parseCorrection('OK.\n', 'Bonjour').mistakes).toEqual([])
  })

  it('parses the corrected line and mistake lines', () => {
    const r = parseCorrection("Hier, j'ai mangé une pomme.\nje mange -> j'ai mangé (past tense)", 'Hier je mange une pomme.')
    expect(r.ok).toBe(false)
    expect(r.corrected).toBe("Hier, j'ai mangé une pomme.")
    expect(r.mistakes).toEqual([{ wrong: 'je mange', right: "j'ai mangé", why: 'past tense' }])
  })

  it('handles bullets, unicode arrows and missing reasons', () => {
    const r = parseCorrection('Je vais à la plage.\n- je va → je vais', 'Je va à la plage.')
    expect(r.mistakes).toEqual([{ wrong: 'je va', right: 'je vais', why: '' }])
  })

  it('says OK when the model repeats the input', () => {
    expect(parseCorrection('Bonjour tout le monde.', 'bonjour tout le monde').ok).toBe(true)
  })

  it('drops no-op mistakes', () => {
    const r = parseCorrection('Salut !\nsalut -> Salut', 'salut')
    expect(r.mistakes).toEqual([])
  })

  it('empty reply is not an error', () => {
    expect(parseCorrection('', 'Bonjour').ok).toBe(true)
  })
})

describe('highlight', () => {
  it('marks the wrong span and keeps the rest', () => {
    const m = { wrong: 'je mange', right: "j'ai mangé", why: 'past tense' }
    const segs = highlight('Hier je mange une pomme.', [m])
    expect(segs.map((s) => s.text).join('')).toBe('Hier je mange une pomme.')
    expect(segs.find((s) => s.mistake)?.text).toBe('je mange')
  })

  it('ignores mistakes that are not in the text', () => {
    expect(highlight('Bonjour', [{ wrong: 'xyz', right: 'abc', why: '' }])).toEqual([{ text: 'Bonjour' }])
  })

  it('does not overlap spans', () => {
    const segs = highlight('le chatte noir', [
      { wrong: 'le chatte', right: 'la chatte', why: '' },
      { wrong: 'chatte', right: 'chat', why: '' },
    ])
    expect(segs.map((s) => s.text).join('')).toBe('le chatte noir')
    expect(segs.filter((s) => s.mistake)).toHaveLength(1)
  })
})
