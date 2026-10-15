// Gemini API keys, in preference order. GEMINI_API_KEY_2 is an optional backup
// that takes over when the primary is rate-limited. Free-tier quota is per
// Google Cloud PROJECT, so the backup only adds capacity if it comes from a
// different project than the primary.

export interface GeminiKey {
  /** Stable label used to namespace per-key cooldowns ('primary' | 'backup'). */
  id: 'primary' | 'backup'
  key: string
}

export function geminiKeys(): GeminiKey[] {
  const out: GeminiKey[] = []
  const primary = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const backup = process.env.GEMINI_API_KEY_2
  if (primary) out.push({ id: 'primary', key: primary })
  if (backup && backup !== primary) out.push({ id: 'backup', key: backup })
  return out
}
