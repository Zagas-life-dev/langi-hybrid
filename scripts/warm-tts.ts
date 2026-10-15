/**
 * Pre-generate read-aloud audio so no learner ever waits for it.
 *
 *     npm run warm-tts -- fr                 # French: lessons, examples, stories, vocabulary
 *     npm run warm-tts -- fr es              # French first, then Spanish
 *     npm run warm-tts -- fr --dry           # just report what WOULD be generated
 *     npm run warm-tts -- fr --only vocab    # one batch: examples | stories | vocab | lessons
 *     npm run warm-tts -- fr --limit 50
 *     npm run warm-tts -- fr --gemini        # old behaviour: Gemini voices, not local
 *
 * By default this is the OVERNIGHT run: every clip comes from Langi's own
 * designed voices on the local Qwen3-TTS server (LOCAL_TTS_URL, see
 * lib/localTts.ts), is uploaded to the CDN, and is then served to every learner
 * from the cache — the local model never has to be reachable from production.
 * Clips already made in a local voice are skipped, so it is safe to stop and
 * re-run at any time; existing Gemini clips are NOT counted as done, since the
 * point is to replace them with the consistent local voices.
 *
 * Built to run unattended: if the local server goes away it waits for it to come
 * back rather than failing the rest of the night, and each clip gets a few
 * retries. Batches run quickest-win first (example sentences, stories, then
 * vocabulary, then the long English lesson explanations).
 *
 * CRITICAL: segmentation, style and language tag all come from lib/segments.ts,
 * the same module the UI uses. The cache key is a hash of the segment text plus
 * voice/lang — so if this script split text even slightly differently it would
 * happily generate audio the app never requests. Do not inline a bespoke split.
 */
// Env comes from `tsx --env-file=.env.local` in the npm script — it must be
// loaded before lib/db is imported, and ES import hoisting makes an in-file
// dotenv.config() run too late to help.
import mongoose from 'mongoose'
import { connectDB } from '../lib/db'
import GrammarLesson from '../lib/models/GrammarLesson'
import Story from '../lib/models/Story'
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import { speakExpressive, isCached, MAX_TTS_CHARS, type SpeakOptions } from '../lib/expressiveTts'
import { localTtsUrl, localTtsReachable, voiceFor } from '../lib/localTts'
import {
  lessonSegments,
  exampleSegments,
  storySegments,
  SURFACE_STYLE,
  nativeSpeechTag,
} from '../lib/segments'
import { speechTag, langName } from '../lib/langs'
import { activeBackend } from '../lib/audioStore'
import type { TtsStyle } from '../lib/ttsStyles'

type Batch = 'examples' | 'stories' | 'vocab' | 'lessons'
const BATCHES: Batch[] = ['examples', 'stories', 'vocab', 'lessons']

interface Job {
  text: string
  lang: string
  style: TtsStyle
  source: string
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const KB = 1024
const RETRIES = 3
const SERVER_WAIT_MS = 30_000
const SERVER_GIVE_UP_MS = 60 * 60_000 // an hour without the server = stop for the night

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const stamp = () => new Date().toLocaleTimeString()

/** Everything that gets read aloud for one language, grouped into batches. */
async function collect(lang: string): Promise<Record<Batch, Job[]>> {
  const target = speechTag(lang)          // e.g. 'fr-FR' — target-language audio
  const native = nativeSpeechTag('en')    // lesson prose is explained in English
  const out: Record<Batch, Job[]> = { examples: [], stories: [], vocab: [], lessons: [] }

  const lessons = await GrammarLesson.find({ languageCode: lang }).lean()
  for (const l of lessons) {
    for (const text of exampleSegments(l)) {
      out.examples.push({ text, lang: target, style: SURFACE_STYLE.example, source: `example:${l.slug}` })
    }
    for (const text of lessonSegments(l)) {
      out.lessons.push({ text, lang: native, style: SURFACE_STYLE.lesson, source: `lesson:${l.slug}` })
    }
  }

  const stories = await Story.find({ languageCode: lang }).lean()
  for (const s of stories) {
    for (const text of storySegments(s)) {
      out.stories.push({ text, lang: target, style: SURFACE_STYLE.story, source: `story:${String(s._id)}` })
    }
  }

  // Vocabulary from the curated decks (not learners' personal "Saved words").
  // Flashcards play these in the 'clear' style (components/ReviewSession.tsx).
  const decks = await Deck.find({ languageCode: lang, isSystem: true }).select('_id slug').lean()
  const cards = await Card.find({ deckId: { $in: decks.map((d) => d._id) } }).select('term exampleSentence deckId').lean()
  const slugById = new Map(decks.map((d) => [String(d._id), d.slug]))
  for (const c of cards) {
    const deck = slugById.get(String(c.deckId)) ?? 'deck'
    out.vocab.push({ text: c.term.trim(), lang: target, style: SURFACE_STYLE.word, source: `word:${deck}` })
    if (c.exampleSentence?.trim()) {
      out.vocab.push({ text: c.exampleSentence.trim(), lang: target, style: SURFACE_STYLE.example, source: `word-example:${deck}` })
    }
  }
  return out
}

/** Wait (up to an hour) for the local server to answer. */
async function waitForServer(): Promise<boolean> {
  const started = Date.now()
  let warned = false
  while (Date.now() - started < SERVER_GIVE_UP_MS) {
    if (await localTtsReachable()) {
      if (warned) console.log(`  ${stamp()} local TTS server is back — continuing`)
      return true
    }
    if (!warned) {
      console.warn(`  ${stamp()} local TTS server not reachable at ${localTtsUrl()} — waiting for it...`)
      warned = true
    }
    await sleep(SERVER_WAIT_MS)
  }
  return false
}

async function main() {
  const langs = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--only', '--limit'].includes(all[i - 1]))
  if (!langs.length) {
    console.error('Usage: npm run warm-tts -- <langCode...> [--dry] [--only examples|stories|vocab|lessons] [--limit N] [--gemini]')
    process.exit(1)
  }

  const dry = process.argv.includes('--dry')
  const useGemini = process.argv.includes('--gemini')
  const opts: SpeakOptions = { localOnly: !useGemini }
  const only = arg('only') as Batch | undefined
  if (only && !BATCHES.includes(only)) {
    console.error(`--only must be one of: ${BATCHES.join(', ')}`)
    process.exit(1)
  }
  const limit = Number(arg('limit') || '0') || Infinity

  if (!useGemini && !localTtsUrl()) {
    console.error('LOCAL_TTS_URL is not set (e.g. LOCAL_TTS_URL=http://localhost:5001 in .env.local).')
    process.exit(1)
  }

  await connectDB()
  console.log(`\nVoices: ${useGemini ? 'Gemini' : `local (${localTtsUrl()})`}   storage: ${activeBackend()}`)

  let totalOk = 0, totalFailed = 0, totalBytes = 0
  const runStarted = Date.now()

  for (const lang of langs) {
    const groups = await collect(lang)
    console.log(`\n=== ${langName(lang)} (${lang}) ===`)

    for (const batch of BATCHES) {
      if (only && batch !== only) continue

      // Oversized segments are rejected, identical text only needs doing once,
      // and with local voices a segment with no designed voice is skipped.
      const seen = new Set<string>()
      let noVoice = 0
      const queue = groups[batch].filter((j) => {
        if (j.text.length > MAX_TTS_CHARS) return false
        if (!useGemini && !voiceFor(j.lang, j.style)) { noVoice++; return false }
        const k = `${j.lang}|${j.style}|${j.text}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

      // Skip anything already done — this is what makes re-runs nearly free.
      const todo: Job[] = []
      let cached = 0
      for (const j of queue) {
        if (await isCached({ text: j.text, lang: j.lang, style: j.style }, opts)) { cached++; continue }
        todo.push(j)
        if (todo.length >= limit) break
      }
      console.log(
        `\n-- ${batch}: ${queue.length} clips, ${cached} done already, ${todo.length} to generate` +
        (noVoice ? `, ${noVoice} skipped (no local voice for that language yet)` : '')
      )
      if (dry || !todo.length) continue

      let ok = 0, failed = 0
      const started = Date.now()
      for (const [i, j] of todo.entries()) {
        const label = `[${i + 1}/${todo.length}] ${j.source}`
        let done = false
        for (let attempt = 1; attempt <= RETRIES && !done; attempt++) {
          if (!useGemini && !(await waitForServer())) {
            console.error(`\n  ${stamp()} local server gone for an hour — stopping. Re-run to resume.\n`)
            await finish(totalOk + ok, totalFailed + failed, totalBytes, runStarted)
            process.exit(2)
          }
          try {
            const res = await speakExpressive({ text: j.text, lang: j.lang, style: j.style }, opts)
            ok++
            totalBytes += res.bytes
            done = true
            const avg = (Date.now() - started) / (i + 1)
            const eta = Math.round((avg * (todo.length - i - 1)) / 60000)
            console.log(`  ${stamp()} ${label} ${(res.bytes / KB).toFixed(0)} KB${res.url ? ' cdn' : ''}  ~${eta} min left in batch`)
          } catch (e) {
            const msg = (e as Error).message
            if (attempt < RETRIES) {
              console.warn(`  ${stamp()} ${label} attempt ${attempt} failed: ${msg} — retrying`)
              await sleep(5000 * attempt)
            } else {
              failed++
              console.warn(`  ${stamp()} ${label} FAILED: ${msg}`)
              // Gemini quota walls mean everything after fails too.
              if (useGemini && /quota|429|rate/i.test(msg)) {
                console.warn('\n  Upstream quota reached — stopping early. Re-run later to continue.\n')
                await finish(totalOk + ok, totalFailed + failed, totalBytes, runStarted)
                process.exit(3)
              }
            }
          }
        }
      }
      totalOk += ok
      totalFailed += failed
      console.log(`  ${batch} done: ${ok} generated, ${failed} failed, ${((Date.now() - started) / 60000).toFixed(1)} min`)
    }
  }

  if (dry) console.log('\n--dry: stopped before any generation.')
  await finish(totalOk, totalFailed, totalBytes, runStarted)
}

async function finish(ok: number, failed: number, bytes: number, started: number) {
  const mins = ((Date.now() - started) / 60000).toFixed(1)
  console.log(`\nGenerated ${ok}, failed ${failed}, ${(bytes / KB / KB).toFixed(1)} MB stored, ${mins} min`)
  console.log('Re-run any time; finished clips are skipped.\n')
  await mongoose.disconnect().catch(() => {})
}

main().catch(async (e) => {
  console.error(e)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
