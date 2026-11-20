/**
 * Build a placement-test question bank for Yoruba / Igbo / Hausa from their generated sentence decks.
 * File-only (never touches the database): writes data/<lang>/placement.json, which `npm run seed -- <lang>`
 * then loads. Deterministic, so re-running gives the same questions.
 *
 *   node scripts/build-ng-placement.mjs yo      (or ig / ha / all)
 *
 * Each question is "What does <sentence> mean?" with the right English plus three real translations of
 * other sentences at the same level, similar in length so length alone doesn't give the answer away.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const LANGS = { yo: 'yoruba', ig: 'igbo', ha: 'hausa' }
const PER_LEVEL = 12 // questions per level (A1, A2, B1)
const LEVELS = ['A1', 'A2', 'B1']

const arg = (process.argv[2] || 'all').toLowerCase()
const targets = arg === 'all' ? Object.keys(LANGS) : [arg]

// A small seeded PRNG (mulberry32), so the bank is stable between runs.
function rng(seedText) {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19))
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

for (const code of targets) {
  const dir = LANGS[code]
  if (!dir) throw new Error(`Unknown language ${code}. Use yo, ig, ha or all.`)
  const root = path.join(process.cwd(), 'data', dir)
  const random = rng(code + '-placement')
  const shuffle = (arr) => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // Every card, tagged with its deck's level.
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, []]))
  for (const file of readdirSync(root).filter((f) => /^sentences-.*\.json$/.test(f)).sort()) {
    const deck = JSON.parse(readFileSync(path.join(root, file), 'utf8'))
    if (!byLevel[deck.level]) continue
    for (const c of deck.cards) {
      if (c.term && c.translation) byLevel[deck.level].push({ term: c.term.trim(), translation: c.translation.trim() })
    }
  }

  const questions = []
  const usedPrompts = new Set()
  for (const level of LEVELS) {
    const pool = shuffle(byLevel[level])
    const chosen = []
    for (const card of pool) {
      if (chosen.length >= PER_LEVEL) break
      const prompt = `What does "${card.term}" mean?`
      if (usedPrompts.has(prompt)) continue
      // Distractors: other translations at this level, nearest in length, never the same text.
      const others = pool
        .filter((o) => o.translation.toLowerCase() !== card.translation.toLowerCase())
        .map((o) => ({ o, d: Math.abs(o.translation.length - card.translation.length) + random() * 3 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12)
      const distractors = []
      for (const { o } of others) {
        if (distractors.length >= 3) break
        if (!distractors.some((d) => d.toLowerCase() === o.translation.toLowerCase())) distractors.push(o.translation)
      }
      if (distractors.length < 3) continue
      const options = shuffle([card.translation, ...distractors])
      usedPrompts.add(prompt)
      chosen.push({ level, kind: 'vocab', prompt, options, answerIndex: options.indexOf(card.translation) })
    }
    questions.push(...chosen)
    console.log(`  ${code} ${level}: ${chosen.length} questions`)
  }
  writeFileSync(path.join(root, 'placement.json'), JSON.stringify({ questions }, null, 2) + '\n', 'utf8')
  console.log(`${code}: wrote ${questions.length} questions to data/${dir}/placement.json`)
}
