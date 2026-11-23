// Pre-generate read-aloud audio for the Nigerian decks (Yoruba, Igbo, Hausa) and host every clip on Cloudinary.
// Engine: Gemini TTS (default). Local Qwen3-TTS has no yo/ig/ha support, so it stays here only as
// --engine local for tests; French and Spanish use local Qwen through their own pipeline.
// Browsers have no yo/ig/ha voices, so the app plays these files instead of speechSynthesis.
//
//   node --env-file=.env.local scripts/generate-ng-audio.mjs [--lang yo,ig,ha] [--limit N] [--no-upload] [--wait] [--delay SECONDS] [--engine gemini|local]
//
// - Resumable: a card is skipped once its mp3 exists locally AND is uploaded. Safe to stop and re-run.
// - Fair: cycles yo -> ig -> ha and walks decks in order, so A1 is done in all three before B1 starts.
// - Gemini: rotates GEMINI_API_KEY / GEMINI_API_KEY_2. A per-minute 429 backs off 30 s; a per-day 429 retires that
//   key until midnight Pacific. With --wait the script then sleeps and carries on (leave it running for days);
//   without --wait it stops and says how many cards are left.
// - Local engine only: starts KoboldCpp (C:\koboldcpp\start-langi-tts.cmd) when it is not running.
// - Runaway guard: the model sometimes babbles past the end of a line. Over-long clips retry with a
//   slightly different input (see spokenVariants) and are dropped if every variant runs away.
// - Output (git-ignored: the decks are CC BY-NC data): tts-out/<lang>/<id>.mp3, tts-out/manifest.json,
//   tts-out/uploaded.json. id = sha1("<lang>|<term>").slice(0,16); the app derives the same id.
// - Cloudinary public id ng-audio/<lang>/<id>, so the app needs no database: set
//   NEXT_PUBLIC_NG_AUDIO_BASE_URL=https://res.cloudinary.com/<cloud>/video/upload/ng-audio
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }

const TTS_URL = (process.env.LOCAL_TTS_URL || 'http://localhost:5001').replace(/\/+$/, '')
const LAUNCHER = 'C:\\koboldcpp\\start-langi-tts.cmd'
const LIMIT = Number(opt('limit', '0')) || Infinity
const UPLOAD = !flag('no-upload')
const SEED = Number(opt('seed', '1234'))
const ENGINE = opt('engine', '') // '' = each language's own default (fr local, yo/ig/ha gemini)
const WAIT = flag('wait')
const DELAY_MS = Number(opt('delay', '5')) * 1000
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore'
const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean)
const retiredUntil = keys.map(() => 0)
let rr = 0
const TIMEOUT_MS = 3 * 60_000
const OUT = 'tts-out'

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME
const CKEY = process.env.CLOUDINARY_API_KEY
const CSECRET = process.env.CLOUDINARY_API_SECRET
if (UPLOAD && !(CLOUD && CKEY && CSECRET)) throw new Error('CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET missing (or pass --no-upload)')

// One fixed voice per language (same description + seed = same speaker on every clip).
// Qwen3-TTS has no official yo/ig/ha support: `language` is ignored for them, so the description carries the accent.
const STUDIO = ' Studio-quality recording, close microphone, crisp and clean articulation, no reverb, no echo, no background noise.'
const LANGS = {
  // French: Qwen3-TTS supports it, so it runs on the local model with the old "fr-teacher-v1" voice (seed 1234).
  fr: {
    dir: 'french', name: 'French', engine: 'local', qwen: 'fr', files: /^\d\d-.+\.json$/,
    voice: "Un homme français de naissance, d'une quarantaine d'années, né et élevé à Paris, qui parle un français parisien parfaitement natif, sans aucun accent étranger. " +
      'Voix calme, claire et bienveillante ; un professeur patient qui explique à un élève, un peu plus lentement sur les mots importants. ' +
      'Enregistrement de qualité studio, micro proche : son net, précis et présent, articulation impeccable de chaque consonne, sans écho ni bruit de fond.',
  },
  yo: { dir: 'yoruba', name: 'Yoruba', voice: 'A native Yoruba woman in her thirties from Lagos, speaking Yoruba with a perfectly native Yoruba accent and correct tones. Calm, clear, friendly voice; a patient language teacher.' + STUDIO },
  ig: { dir: 'igbo', name: 'Igbo', voice: 'A native Igbo woman in her thirties from Enugu, speaking Igbo with a perfectly native Igbo accent and correct tones. Calm, clear, friendly voice; a patient language teacher.' + STUDIO },
  ha: { dir: 'hausa', name: 'Hausa', voice: 'A native Hausa woman in her thirties from Kano, speaking Hausa with a perfectly native Hausa accent. Calm, clear, friendly voice; a patient language teacher.' + STUDIO },
}
const wanted = opt('lang', 'yo,ig,ha').split(',').map((s) => s.trim()).filter((c) => LANGS[c])
if (!wanted.length) throw new Error('--lang must be some of: fr, yo, ig, ha')
const engineOf = (it) => ENGINE || LANGS[it.code].engine || 'gemini'
if (wanted.some((c) => (ENGINE || LANGS[c].engine || 'gemini') === 'gemini') && !keys.length) throw new Error('GEMINI_API_KEY missing (run with --env-file=.env.local)')

const audioId = (lang, term) => createHash('sha1').update(`${lang}|${term}`).digest('hex').slice(0, 16)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[${new Date().toTimeString().slice(0, 8)}]`, ...a)

// --- State ---------------------------------------------------------------------
mkdirSync(OUT, { recursive: true })
for (const l of wanted) mkdirSync(`${OUT}/${l}`, { recursive: true })
const loadJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d)
// Progress is stored per language (tts-out/state-<lang>.json) so a Gemini run and a local run can go at the
// same time without overwriting each other. The legacy shared manifest.json / uploaded.json are still read.
const manifest = loadJson(`${OUT}/manifest.json`, {})
const uploaded = loadJson(`${OUT}/uploaded.json`, {})
for (const l of wanted) {
  const s = loadJson(`${OUT}/state-${l}.json`, null)
  if (s) { Object.assign((manifest[l] ??= {}), s.manifest); Object.assign((uploaded[l] ??= {}), s.uploaded) }
}
function save(path, obj) { writeFileSync(`${path}.tmp`, JSON.stringify(obj)); renameSync(`${path}.tmp`, path) }
const saveAll = () => { for (const l of wanted) save(`${OUT}/state-${l}.json`, { manifest: manifest[l] ?? {}, uploaded: uploaded[l] ?? {} }) }

function queueFor(code) {
  const { dir, files = /^sentences-\d+\.json$/ } = LANGS[code]
  const seen = new Set()
  const items = []
  for (const f of readdirSync(`data/${dir}`).filter((f) => files.test(f)).sort()) {
    for (const c of JSON.parse(readFileSync(`data/${dir}/${f}`, 'utf8')).cards) {
      const term = c.term.trim()
      const id = audioId(code, term)
      if (!term || seen.has(id)) continue
      seen.add(id)
      items.push({ code, term, id })
    }
  }
  return items
}
const fileOf = (it) => `${OUT}/${it.code}/${it.id}.mp3`
const isUploaded = (it) => Boolean(uploaded[it.code]?.[it.id])
const finished = (it) => existsSync(fileOf(it)) && (!UPLOAD || isUploaded(it))

const queues = wanted.map(queueFor)
const total = queues.reduce((n, q) => n + q.length, 0)
const todo = []
for (let i = 0; queues.some((q) => i < q.length); i++) for (const q of queues) if (q[i] && !finished(q[i])) todo.push(q[i])
log(`${total} cards in ${wanted.join(', ')}; ${total - todo.length} finished; ${todo.length} to go. Upload: ${UPLOAD ? `Cloudinary ${CLOUD}` : 'off'}`)

// --- Local server --------------------------------------------------------------
async function serverUp() {
  try {
    const r = await fetch(`${TTS_URL}/api/extra/version`, { signal: AbortSignal.timeout(5000) })
    return r.ok && Boolean((await r.json().catch(() => null))?.tts)
  } catch { return false }
}
async function ensureServer() {
  if (await serverUp()) return true
  log('KoboldCpp not running: starting it')
  spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process -WindowStyle Minimized '${LAUNCHER}'`], { stdio: 'ignore' })
  for (let i = 0; i < 60; i++) { await sleep(5000); if (await serverUp()) { log('KoboldCpp is up'); return true } }
  return false
}

// --- Generation ----------------------------------------------------------------
function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV')
  let rate = 24000, ch = 1, bits = 16, off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4), body = off + 8
    if (id === 'fmt ') { ch = buf.readUInt16LE(body + 2); rate = buf.readUInt32LE(body + 4); bits = buf.readUInt16LE(body + 14) }
    else if (id === 'data') return { pcm: buf.subarray(body, Math.min(buf.length, body + size)), rate, ch, bits }
    off = body + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}
const seconds = (w) => w.pcm.length / (w.rate * w.ch * (w.bits / 8))
// Without closing punctuation the model may never decide the line is over.
const spokenText = (t) => (/[.!?…:;»"”')\]]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`)
const maxSeconds = (t) => 3 + t.length / 6
function variants(text) {
  const base = spokenText(text)
  const flipped = base.replace(/\p{L}/u, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
  return [...new Set([base, flipped, base.replace(/[.…]+$/, '') + ' !'])]
}

/** Next midnight Pacific (Google's daily quota reset), as epoch ms. */
function nextPacificMidnight() {
  const now = new Date()
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const next = new Date(la); next.setHours(24, 0, 5, 0)
  return now.getTime() + (next.getTime() - la.getTime())
}
class Quota extends Error { constructor(daily) { super('rate limited'); this.daily = daily } }

async function generateGemini(it, k) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': keys[k] },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Read this ${LANGS[it.code].name} sentence aloud slowly and clearly, as a language teacher would: ${it.term}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } } },
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (res.status === 429) throw new Quota(/PerDay|per day/i.test(await res.text()))
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 140)}`)
  const inline = (await res.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
  if (!inline) throw new Error('Gemini returned no audio')
  const rate = Number(/rate=(\d+)/.exec(inline.mimeType || '')?.[1] || 24000)
  const pcm = Buffer.from(inline.data, 'base64')
  if (pcm.length < rate * 0.3) throw new Error('Gemini audio too short')
  return { pcm, rate, ch: 1, bits: 16 }
}

async function generate(it) {
  const { voice } = LANGS[it.code]
  let longest = 0
  for (const input of variants(it.term)) {
    const res = await fetch(`${TTS_URL}/api/extra/tts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, voice: 'instruct', instruction: voice, language: LANGS[it.code].qwen || 'auto', seed: SEED }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`local TTS HTTP ${res.status}`)
    const wav = parseWav(Buffer.from(await res.arrayBuffer()))
    if (wav.pcm.length < 2000) throw new Error('local TTS returned (almost) no audio')
    const s = seconds(wav)
    if (s <= maxSeconds(it.term)) return wav
    longest = Math.max(longest, s)
  }
  throw new Error(`runaway audio (${longest.toFixed(0)}s for ${it.term.length} chars)`)
}

/** 16-bit PCM in, small mono mp3 out (about 10 KB for a 3 s sentence); trims leading/trailing silence. */
function toMp3(w, file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(w.rate), '-ac', String(w.ch), '-i', 'pipe:0',
      '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
      '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '32k', file])
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}: ${err.slice(0, 160)}`))))
    p.stdin.end(w.pcm)
  })
}

// --- Cloudinary ----------------------------------------------------------------
async function upload(it) {
  const publicId = `ng-audio/${it.code}/${it.id}`
  const timestamp = Math.floor(Date.now() / 1000)
  const toSign = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}${CSECRET}`
  const form = new FormData()
  form.set('file', new Blob([readFileSync(fileOf(it))], { type: 'audio/mpeg' }), `${it.id}.mp3`)
  form.set('public_id', publicId)
  form.set('overwrite', 'true')
  form.set('timestamp', String(timestamp))
  form.set('api_key', CKEY)
  form.set('signature', createHash('sha1').update(toSign).digest('hex'))
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
    if (res.ok) return
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * attempt); continue }
    throw new Error(`Cloudinary HTTP ${res.status}: ${(await res.text()).slice(0, 160).replace(CSECRET, '***')}`)
  }
  throw new Error('Cloudinary kept failing')
}

// --- Main loop -----------------------------------------------------------------
let done = 0, failed = 0, runaways = 0
const started = Date.now()
for (let n = 0; n < todo.length && done < LIMIT; n++) {
  const it = todo[n]
  try {
    if (!existsSync(fileOf(it))) {
      let wav
      if (engineOf(it) === 'gemini') {
        // Pick a live key; if every key is out for the day, sleep (--wait) or stop.
        let live = keys.map((_, i) => i).filter((i) => retiredUntil[i] <= Date.now())
        if (!live.length) {
          const resume = Math.min(...retiredUntil)
          if (!WAIT) { log(`Daily quota used on every key. ${todo.length - n} cards left. Run again after ${new Date(resume).toLocaleString()} or pass --wait.`); break }
          log(`Daily quota used up. Sleeping until ${new Date(resume).toLocaleString()} (${todo.length - n} cards left)...`)
          await sleep(Math.max(60_000, resume - Date.now()))
          n--; continue
        }
        const k = live[rr++ % live.length]
        try { wav = await generateGemini(it, k) }
        catch (e) {
          if (!(e instanceof Quota)) throw e
          if (e.daily) { retiredUntil[k] = nextPacificMidnight(); log(`key ${k + 1}: daily quota reached`) }
          else { log(`key ${k + 1}: per-minute limit, backing off 30 s`); await sleep(30_000) }
          n--; continue
        }
        await sleep(DELAY_MS)
      } else {
        if (!(await ensureServer())) { log('No TTS server after 5 minutes: stopping.'); break }
        wav = await generate(it)
      }
      await toMp3(wav, fileOf(it))
      ;(manifest[it.code] ??= {})[it.id] = it.term
    }
    if (UPLOAD && !isUploaded(it)) {
      await upload(it)
      ;(uploaded[it.code] ??= {})[it.id] = 1
    }
    done++
    if (done % 5 === 0) saveAll()
    const rate = (Date.now() - started) / done / 1000
    log(`ok ${it.code} ${it.id} (${done}, ${todo.length - n - 1} left, ~${Math.round(((todo.length - n - 1) * rate) / 3600)} h) ${it.term}`)
  } catch (e) {
    failed++
    if (/runaway/.test(e.message)) runaways++
    log(`FAIL ${it.code} ${it.id}: ${e.message} | ${it.term}`)
    if (failed >= 25 && done === 0) { log('25 failures and no successes: stopping.'); break }
    if (/fetch failed|aborted|timeout/i.test(e.message)) await sleep(10_000)
  }
}
saveAll()
log(`Finished: ${done} clips, ${failed} failures (${runaways} runaways), ${todo.length - done - failed} not attempted.`)
