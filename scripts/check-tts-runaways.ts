/**
 * Find stored local-voice clips that are far too long for their text (the model
 * babbled on past the end) and, with --delete, drop them so warm-tts redoes them.
 *
 *     npx tsx --env-file=.env.local scripts/check-tts-runaways.ts [--delete]
 */
import mongoose from 'mongoose'
import { connectDB } from '../lib/db'
import GrammarLesson from '../lib/models/GrammarLesson'
import Story from '../lib/models/Story'
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import TtsCache from '../lib/models/TtsCache'
import { localCacheKey } from '../lib/expressiveTts'
import { maxSeconds } from '../lib/localTts'
import { exampleSegments, storySegments, SURFACE_STYLE } from '../lib/segments'
import { speechTag } from '../lib/langs'
const KBPS = 80
async function main() {
  await connectDB()
  let checked = 0
  const bad: string[] = []
  for (const lang of ['fr', 'es']) {
    const tag = speechTag(lang)
    const jobs: { text: string; style: 'conversational' | 'story' | 'clear' }[] = []
    for (const l of await GrammarLesson.find({ languageCode: lang }).lean()) for (const t of exampleSegments(l)) jobs.push({ text: t, style: SURFACE_STYLE.example })
    for (const s of await Story.find({ languageCode: lang }).lean()) for (const t of storySegments(s)) jobs.push({ text: t, style: SURFACE_STYLE.story })
    const decks = await Deck.find({ languageCode: lang, isSystem: true }).select('_id').lean()
    for (const c of await Card.find({ deckId: { $in: decks.map((d) => d._id) } }).select('term').lean()) jobs.push({ text: c.term.trim(), style: SURFACE_STYLE.word })
    const keys = new Map<string, string>()
    for (const j of jobs) { const k = localCacheKey({ text: j.text, lang: tag, style: j.style }); if (k) keys.set(k, j.text) }
    const rows = await TtsCache.find({ key: { $in: [...keys.keys()] } }).select('key bytes').lean()
    for (const r of rows) {
      checked++
      const text = keys.get(r.key)!
      const secs = (r.bytes * 8) / (KBPS * 1000)
      if (secs > maxSeconds(text)) bad.push(`${lang}\t${secs.toFixed(1)}s\t${JSON.stringify(text)}\t${r.key}`)
    }
  }
  console.log(`checked ${checked} clips, ${bad.length} suspiciously long:`)
  if (process.argv.includes("--delete") && bad.length) {
    const r = await TtsCache.deleteMany({ key: { $in: bad.map((b) => b.split("	")[3]) } })
    console.log(`deleted ${r.deletedCount} cache rows — re-run warm-tts to regenerate`)
  }
  for (const b of bad) console.log(b)
  await mongoose.disconnect()
}
main()
