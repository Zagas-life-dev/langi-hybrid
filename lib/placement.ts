import { connectDB } from '@/lib/db'
import PlacementQuestion from '@/lib/models/PlacementQuestion'
import { CEFR_LEVELS, type CefrLevel } from '@/lib/models/LangiUser'

// Fraction of a level's questions a learner must get right to "pass" it and
// unlock the next level up.
const PASS_THRESHOLD = 0.6

export interface PlacementFormQuestion {
  id: string
  level: CefrLevel
  kind: string
  prompt: string
  options: string[]
}

// How many of each skill to sample per level — keeps the test focused (~30 Qs)
// while measuring grammar at every level. Grammar gets the larger share since
// it's what we place on.
const PER_LEVEL: Record<string, number> = { grammar: 3, vocab: 2, reading: 1 }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * The placement test, ordered easiest → hardest, with answers stripped. A
 * balanced, randomized sample is drawn per (level, skill) so the test stays
 * short and grammar is probed at every level; retakes vary.
 */
export async function getPlacementForm(lang: string): Promise<PlacementFormQuestion[]> {
  await connectDB()
  const all = await PlacementQuestion.find({ languageCode: lang }).lean()

  // Bucket by level → skill, sample, then flatten easiest → hardest.
  const order = (l: string) => CEFR_LEVELS.indexOf(l as CefrLevel)
  const picked: typeof all = []
  for (const level of CEFR_LEVELS) {
    const inLevel = all.filter((q) => q.level === level)
    const bySkill: Record<string, typeof all> = {}
    for (const q of inLevel) (bySkill[q.kind || 'vocab'] ??= []).push(q)
    for (const [skill, qs] of Object.entries(bySkill)) {
      picked.push(...shuffle(qs).slice(0, PER_LEVEL[skill] ?? 2))
    }
  }
  picked.sort((a, b) => order(a.level) - order(b.level))

  return picked.map((q) => ({
    id: String(q._id),
    level: q.level,
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
  }))
}

type LevelScore = Record<string, { correct: number; total: number }>

export interface PlacementScore {
  level: CefrLevel
  // Per-skill ceiling (e.g. { grammar: 'A2', vocab: 'B1' }).
  levelBySkill: Record<string, CefrLevel>
  // Overall correct/total per level (for the result bar chart).
  scoreByLevel: LevelScore
}

/** Highest level a skill cleanly passes (passes it AND every lower level that
 * has questions). Levels with no questions are skipped. Failing the first tested
 * level yields A1. */
function ceilingFor(scoreByLevel: LevelScore): CefrLevel {
  let level: CefrLevel = 'A1'
  for (const lvl of CEFR_LEVELS) {
    const s = scoreByLevel[lvl]
    if (!s || s.total === 0) continue
    if (s.correct / s.total >= PASS_THRESHOLD) level = lvl
    else break
  }
  return level
}

/**
 * Score submitted answers and estimate a CEFR level. We score each SKILL
 * (grammar, vocab, …) separately and take the LOWEST skill ceiling as the
 * overall placement: if grammar lags vocabulary, the learner starts at their
 * grammar level and climbs from there — a weaker skill shouldn't be carried by
 * a stronger one. Failing A1 still yields A1 (true beginner).
 */
export async function scorePlacement(
  lang: string,
  answers: { id: string; choice: number }[]
): Promise<PlacementScore> {
  await connectDB()
  const choiceById = new Map(answers.map((a) => [a.id, a.choice]))
  // Score only the questions that were actually asked (the form is sampled).
  const questions = await PlacementQuestion.find({
    languageCode: lang,
    _id: { $in: answers.map((a) => a.id) },
  }).lean()

  const blankLevels = (): LevelScore =>
    Object.fromEntries(CEFR_LEVELS.map((l) => [l, { correct: 0, total: 0 }]))

  const scoreByLevel = blankLevels()
  const bySkill: Record<string, LevelScore> = {}

  for (const q of questions) {
    const correct = choiceById.get(String(q._id)) === q.answerIndex
    scoreByLevel[q.level].total += 1
    if (correct) scoreByLevel[q.level].correct += 1

    const skill = q.kind || 'vocab'
    ;(bySkill[skill] ??= blankLevels())[q.level].total += 1
    if (correct) bySkill[skill][q.level].correct += 1
  }

  const levelBySkill: Record<string, CefrLevel> = {}
  for (const [skill, ls] of Object.entries(bySkill)) {
    // Only score a skill that was actually tested.
    if (CEFR_LEVELS.some((l) => ls[l].total > 0)) levelBySkill[skill] = ceilingFor(ls)
  }

  // Overall = the lowest skill ceiling (climb from the weakest foundation).
  const order = (l: CefrLevel) => CEFR_LEVELS.indexOf(l)
  const skillLevels = Object.values(levelBySkill)
  const level: CefrLevel = skillLevels.length
    ? skillLevels.reduce((lo, l) => (order(l) < order(lo) ? l : lo))
    : 'A1'

  return { level, levelBySkill, scoreByLevel }
}
