import { describe, it, expect } from 'vitest'
import { parseJson3, baseCode, asrSentences, keyedLines } from '@/lib/captionsCore'

describe('parseJson3', () => {
  it('joins segments, skips empty events and converts to seconds', () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 500 },
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hola ' }, { utf8: ' mundo' }] },
        { tStartMs: 3500, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
        { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: '¿Qué tal?' }] },
      ],
    })
    expect(cues).toEqual([
      { start: 1, end: 3, text: 'Hola mundo' },
      { start: 4, end: 5, text: '¿Qué tal?' },
    ])
  })

  it('clips rolling (overlapping) cues to the next cue start', () => {
    const cues = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'uno' }] },
        { tStartMs: 2000, dDurationMs: 5000, segs: [{ utf8: 'dos' }] },
      ],
    })
    expect(cues[0].end).toBe(2)
    expect(cues[1].end).toBe(7)
  })
})

describe('baseCode', () => {
  it('reduces regional codes to the base language', () => {
    expect(baseCode('es-419')).toBe('es')
    expect(baseCode('pt_BR')).toBe('pt')
    expect(baseCode('FR')).toBe('fr')
  })
})

describe('asrSentences', () => {
  // Word-timed ASR events that cut mid-sentence, like YouTube's auto captions.
  const json = {
    events: [
      { tStartMs: 0, dDurationMs: 99999 },
      { tStartMs: 1000, segs: [{ utf8: 'Bonjour' }, { utf8: ' et', tOffsetMs: 300 }, { utf8: ' bienvenue', tOffsetMs: 600 }, { utf8: ' à', tOffsetMs: 900 }, { utf8: ' Paris.', tOffsetMs: 1100 }] },
      { tStartMs: 2400, segs: [{ utf8: '\n' }] },
      { tStartMs: 2500, segs: [{ utf8: "Aujourd'hui," }, { utf8: " c'est", tOffsetMs: 400 }, { utf8: ' la', tOffsetMs: 700 }, { utf8: ' journée', tOffsetMs: 900 }, { utf8: ' des', tOffsetMs: 1200 }] },
      { tStartMs: 3900, segs: [{ utf8: 'premières' }, { utf8: ' fois.', tOffsetMs: 400 }] },
      { tStartMs: 9000, segs: [{ utf8: 'donc' }, { utf8: ' voilà', tOffsetMs: 300 }] },
    ],
  }

  it('rebuilds whole sentences from word timings', () => {
    const cues = asrSentences(json)
    expect(cues.map((c) => c.text)).toEqual([
      'Bonjour et bienvenue à Paris.',
      "Aujourd'hui, c'est la journée des premières fois.",
      'donc voilà',
    ])
    expect(cues[0]).toMatchObject({ start: 1, end: 2.5 })
    expect(cues[1].start).toBe(2.5)
    expect(cues[1].end).toBeCloseTo(4.3 + 1.5) // pause before "donc" → linger
  })

  it('splits long unpunctuated speech', () => {
    const segs = Array.from({ length: 40 }, (_, i) => ({ utf8: ' mot', tOffsetMs: i * 200 }))
    const cues = asrSentences({ events: [{ tStartMs: 0, segs }] })
    expect(cues.length).toBeGreaterThan(1)
    expect(cues.every((c) => c.text.length <= 90)).toBe(true)
  })
})

describe('keyedLines', () => {
  it('maps keyed replies by index and ignores blanks and unasked keys', () => {
    const m = keyedLines({ '4': ' hi ', '5': '', '9': 'extra' }, [4, 5, 6])
    expect([...m]).toEqual([[4, 'hi']])
  })

  it('accepts an array only when it lines up exactly', () => {
    expect([...keyedLines(['a', 'b'], [7, 8])]).toEqual([[7, 'a'], [8, 'b']])
    expect(keyedLines(['merged a+b'], [7, 8]).size).toBe(0)
  })
})
