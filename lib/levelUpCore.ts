// Pure scoring for the level-up test (no DB) so it can be unit-tested.
import type { CefrLevel } from '@/lib/models/LangiUser'

export const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const PASS_OVERALL = 0.7
export const PASS_SECTION = 0.6
/** After a failed attempt, wait this long before retrying (study first!). */
export const RETRY_COOLDOWN_MS = 24 * 60 * 60 * 1000

export function nextLevel(level?: CefrLevel | null): CefrLevel | null {
  if (!level) return null
  const i = LEVELS.indexOf(level)
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null
}

export type Section = 'grammar' | 'vocab'

export interface LevelUpVerdict {
  passed: boolean
  overall: number // 0..1
  bySection: Record<Section, { correct: number; total: number }>
}

/** Pass = overall ≥ 70% AND every section that was tested ≥ 60%, so strong
 * vocabulary can't carry weak grammar (or vice versa). */
export function scoreLevelUp(results: { section: Section; correct: boolean }[]): LevelUpVerdict {
  const bySection: LevelUpVerdict['bySection'] = { grammar: { correct: 0, total: 0 }, vocab: { correct: 0, total: 0 } }
  for (const r of results) {
    bySection[r.section].total++
    if (r.correct) bySection[r.section].correct++
  }
  const total = results.length
  const correct = results.filter((r) => r.correct).length
  const overall = total ? correct / total : 0
  const sectionsOk = Object.values(bySection).every((s) => s.total === 0 || s.correct / s.total >= PASS_SECTION)
  return { passed: total > 0 && overall >= PASS_OVERALL && sectionsOk, overall, bySection }
}
