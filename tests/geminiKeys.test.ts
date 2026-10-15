import { describe, it, expect, afterEach, vi } from 'vitest'
import { geminiKeys } from '@/lib/geminiKeys'

afterEach(() => vi.unstubAllEnvs())

describe('geminiKeys', () => {
  it('returns the primary then the backup', () => {
    vi.stubEnv('GEMINI_API_KEY', 'aaa')
    vi.stubEnv('GEMINI_API_KEY_2', 'bbb')
    expect(geminiKeys()).toEqual([{ id: 'primary', key: 'aaa' }, { id: 'backup', key: 'bbb' }])
  })

  it('ignores a backup identical to the primary', () => {
    vi.stubEnv('GEMINI_API_KEY', 'aaa')
    vi.stubEnv('GEMINI_API_KEY_2', 'aaa')
    expect(geminiKeys().map((k) => k.id)).toEqual(['primary'])
  })

  it('is empty when nothing is configured', () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY_2', '')
    expect(geminiKeys()).toEqual([])
  })
})
