import { describe, it, expect } from 'vitest'
import { stripInstruction } from '@/lib/hybrid/linesCore'

describe('stripInstruction', () => {
  it('drops an echoed task from the sentence', () => {
    expect(stripInstruction('Translate this sentence into Igbo: We must keep our environment clean.')).toBe('We must keep our environment clean.')
    expect(stripInstruction('Translate into Yoruba: "Good morning."')).toBe('Good morning.')
    expect(stripInstruction('Please translate this sentence to Hausa - I am hungry.')).toBe('I am hungry.')
    expect(stripInstruction('Correction: Ọ na-eri nri.')).toBe('Ọ na-eri nri.')
  })
  it('leaves normal sentences alone', () => {
    expect(stripInstruction('We must keep our environment clean.')).toBe('We must keep our environment clean.')
    expect(stripInstruction('Translate is a verb: it means to render.')).toBe('Translate is a verb: it means to render.')
    expect(stripInstruction('Anyị ga-eche ụlọ anyị.')).toBe('Anyị ga-eche ụlọ anyị.')
  })
})
