import { describe, it, expect } from 'vitest'
import { lemmatize } from '@/lib/lemma'

describe('lemmatize', () => {
  it('maps French conjugated forms to the infinitive', () => {
    expect(lemmatize('fr', 'sommes')?.infinitive).toBe('être')
    expect(lemmatize('fr', 'Avions')?.infinitive).toBe('avoir')
  })

  it('maps Spanish forms and carries the English gloss', () => {
    const l = lemmatize('es', 'abro')
    expect(l?.infinitive).toBe('abrir')
    expect(l?.english).toBe('to open')
  })

  it('returns null for unknown words and unsupported languages', () => {
    expect(lemmatize('fr', 'chat')).toBeNull()
    expect(lemmatize('de', 'bin')).toBeNull()
  })
})
