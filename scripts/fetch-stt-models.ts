// Download the offline STT (Vosk small) model archives into public/vosk/ so they
// can be self-hosted same-origin. Run once before deploying if you want offline
// dictation served from your own domain (then set NEXT_PUBLIC_STT_MODEL_BASE=/vosk).
//
//   npm run fetch-stt-models            # all configured languages
//   npm run fetch-stt-models -- fr es   # just these
//
// Source host is the community vosk-browser model mirror by default; override
// with STT_UPSTREAM_BASE. The files are large (~40 MB each) and gitignored.
import { createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { allSttModels } from '../lib/sttModels'

const UPSTREAM = (process.env.STT_UPSTREAM_BASE || 'https://ccoreilly.github.io/vosk-browser/models').replace(/\/+$/, '')
const OUT_DIR = join(process.cwd(), 'public', 'vosk')

async function main() {
  const wanted = process.argv.slice(2).map((s) => s.toLowerCase())
  const models = allSttModels().filter((m) => wanted.length === 0 || wanted.includes(m.lang))
  if (!models.length) {
    console.error('No matching models. Known:', allSttModels().map((m) => m.lang).join(', '))
    process.exit(1)
  }
  await mkdir(OUT_DIR, { recursive: true })

  for (const m of models) {
    const dest = join(OUT_DIR, m.file)
    try {
      const s = await stat(dest)
      if (s.size > 0) {
        console.log(`✓ ${m.lang}: already present (${(s.size / 1e6).toFixed(0)} MB) — skipping`)
        continue
      }
    } catch {
      /* not downloaded yet */
    }
    const url = `${UPSTREAM}/${m.file}`
    process.stdout.write(`↓ ${m.lang}: ${url} … `)
    const res = await fetch(url)
    if (!res.ok || !res.body) {
      console.log(`FAILED (${res.status}) — check the filename/host for '${m.lang}'`)
      continue
    }
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest))
    const s = await stat(dest)
    console.log(`done (${(s.size / 1e6).toFixed(0)} MB)`)
  }
  console.log(`\nSaved to public/vosk/. Set NEXT_PUBLIC_STT_MODEL_BASE=/vosk to serve them same-origin.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
