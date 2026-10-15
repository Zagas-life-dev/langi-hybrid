import { describe, it, expect } from 'vitest'
import { spokenText, spokenVariants, maxSeconds, parseWav } from '@/lib/localTts'

describe('spokenText', () => {
  it('closes bare fragments so the model knows where to stop', () => {
    expect(spokenText('rapide')).toBe('rapide.')
    expect(spokenText(' je trouve que ')).toBe('je trouve que.')
  })
  it('leaves already-punctuated text alone', () => {
    expect(spokenText('Tu parleras.')).toBe('Tu parleras.')
    expect(spokenText('¿Qué tal?')).toBe('¿Qué tal?')
    expect(spokenText('« je suis allé »')).toBe('« je suis allé »')
  })
})

describe('maxSeconds', () => {
  it('allows normal speech but not a runaway', () => {
    expect(maxSeconds('rapide')).toBeLessThan(74)
    expect(maxSeconds('x'.repeat(150))).toBeGreaterThan(15)
  })
})

describe('parseWav', () => {
  it('reads format and samples from a RIFF/WAVE buffer', () => {
    const pcm = Buffer.alloc(8, 1)
    const h = Buffer.alloc(44)
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
    h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
    h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
    const w = parseWav(Buffer.concat([h, pcm]))
    expect(w).toMatchObject({ sampleRate: 24000, channels: 1, bits: 16 })
    expect(w.pcm.length).toBe(8)
  })
})

describe('spokenVariants', () => {
  it('falls back to a flipped first letter, then an exclamation', () => {
    expect(spokenVariants('Tu parleras')).toEqual(['Tu parleras.', 'tu parleras.', 'Tu parleras !'])
    expect(spokenVariants('¿y tú?')).toEqual(['¿y tú?', '¿Y tú?', '¿y tú? !'])
  })
})
