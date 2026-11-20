import { describe, expect, it } from 'vitest'
import { parseExample, parseLines } from '@/lib/hybrid/linesCore'

describe('parseLines', () => {
  it('strips bullets, numbers and quotes', () => {
    expect(parseLines('1. a house\n- "a tree"\n* a river.')).toEqual(['a house', 'a tree', 'a river'])
  })
  it('drops blanks, repeats and excluded values', () => {
    expect(parseLines('car\n\nCar\nboat\nplane\ntrain', ['plane'])).toEqual(['car', 'boat', 'train'])
  })
  it('caps the count and skips rambling lines', () => {
    expect(parseLines('a\nb\nc\nd')).toHaveLength(3)
    expect(parseLines('x'.repeat(200) + '\nok')).toEqual(['ok'])
  })
})

describe('parseExample', () => {
  it('reads sentence then translation', () => {
    expect(parseExample("Je bois du café.\nI drink coffee.")).toEqual({ sentence: 'Je bois du café.', translation: 'I drink coffee.' })
  })
  it('ignores labels and tolerates one line', () => {
    expect(parseExample('Example: Il pleut.\nTranslation: It is raining.')).toEqual({ sentence: 'Il pleut.', translation: 'It is raining.' })
    expect(parseExample('Il pleut.')).toEqual({ sentence: 'Il pleut.', translation: '' })
    expect(parseExample('  \n')).toBeNull()
  })
})
