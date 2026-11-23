import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { ngAudioId, ngLangCode } from '@/lib/ngAudio'

describe('ngAudio', () => {
  it('derives the same id the generator script writes', async () => {
    const node = createHash('sha1').update('yo|O ti dá').digest('hex').slice(0, 16)
    expect(await ngAudioId('yo', 'O ti dá')).toBe(node)
    expect(await ngAudioId('yo', '  O ti dá ')).toBe(node)
  })
  it('recognises only languages we host clips for', () => {
    expect(ngLangCode('yo-NG')).toBe('yo')
    expect(ngLangCode('ig')).toBe('ig')
    expect(ngLangCode('ha-NG')).toBe('ha')
    expect(ngLangCode('fr-FR')).toBe('fr')
    expect(ngLangCode('es-ES')).toBeNull()
  })
})
