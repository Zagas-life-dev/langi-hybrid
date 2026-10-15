import { CEFR_LEVELS, type CefrLevel } from '@/lib/models/LangiUser'

// Reading-access policy. Everything AT OR BELOW the learner's level is open
// (reading easier material builds fluency, so we never lock it), plus ONE level
// up as a stretch (comprehensible input, i+1). Higher levels are locked until
// the learner gets there — which also gives stories a sense of progression.
// Server-only (imports the LangiUser model); the client gets the resulting list.
export function readingUnlocked(cefr?: CefrLevel | null): CefrLevel[] {
  const idx = cefr ? CEFR_LEVELS.indexOf(cefr) : 0
  const maxIdx = Math.min(CEFR_LEVELS.length - 1, Math.max(0, idx) + 1)
  return CEFR_LEVELS.slice(0, maxIdx + 1)
}

export function isReadingUnlocked(level: string, cefr?: CefrLevel | null): boolean {
  return readingUnlocked(cefr).includes(level as CefrLevel)
}
