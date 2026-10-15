/**
 * Upload the offline STT (Vosk small) model archives to Vercel Blob, so they're
 * served from your own CDN (public + CORS) instead of the community host. Run
 * once from the langi/ root:
 *
 *     npm run upload-stt-models            # all configured languages
 *     npm run upload-stt-models -- fr es   # just these
 *
 * Setup (one time):
 *   1. Create a Blob store: Vercel dashboard → Storage → Blob (or `vercel blob`).
 *   2. Pull its token locally:  `vercel env pull .env.local`  (adds
 *      BLOB_READ_WRITE_TOKEN), or paste the token into .env.local.
 *   3. Run this script. It prints the base URL to set as NEXT_PUBLIC_STT_MODEL_BASE
 *      in your Vercel project env (Production + Preview), then redeploy.
 *
 * Source archives come from STT_UPSTREAM_BASE (default: the community vosk-browser
 * mirror), or from local public/vosk/ if you already ran `npm run fetch-stt-models`.
 * Files are streamed straight through — the ~40 MB never fully buffers in memory.
 */
import * as dotenv from 'dotenv'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { put, head } from '@vercel/blob'
import { allSttModels } from '../lib/sttModels'

dotenv.config({ path: '.env.local' })

const UPSTREAM = (process.env.STT_UPSTREAM_BASE || 'https://ccoreilly.github.io/vosk-browser/models').replace(/\/+$/, '')
const LOCAL_DIR = join(process.cwd(), 'public', 'vosk')
const PREFIX = 'vosk' // blob path prefix → stable public URLs at <store>/vosk/<file>

async function bodyFor(file: string): Promise<{ body: ReadableStream | Readable; size?: number }> {
  // Prefer a locally-downloaded copy (from `fetch-stt-models`); else stream upstream.
  const local = join(LOCAL_DIR, file)
  try {
    const s = await stat(local)
    if (s.size > 0) return { body: createReadStream(local), size: s.size }
  } catch {
    /* not local — fall through to upstream */
  }
  const res = await fetch(`${UPSTREAM}/${file}`)
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status} for ${file}`)
  return { body: res.body, size: Number(res.headers.get('content-length')) || undefined }
}

async function main() {
  // Two ways to auth (the @vercel/blob SDK picks up either from the environment):
  //   • BLOB_READ_WRITE_TOKEN — the store's read-write token, OR
  //   • VERCEL_OIDC_TOKEN + BLOB_STORE_ID — short-lived OIDC (works even when the
  //     RW token is marked "Sensitive" and can't be pulled). Get a fresh OIDC
  //     token with `vercel env pull`.
  const hasRwToken = !!process.env.BLOB_READ_WRITE_TOKEN
  const hasOidc = !!process.env.VERCEL_OIDC_TOKEN && !!process.env.BLOB_STORE_ID
  if (!hasRwToken && !hasOidc) {
    console.error('No Blob credentials. Set BLOB_READ_WRITE_TOKEN, or VERCEL_OIDC_TOKEN + BLOB_STORE_ID (via `vercel env pull`).')
    process.exit(1)
  }
  const wanted = process.argv.slice(2).map((s) => s.toLowerCase())
  const models = allSttModels().filter((m) => wanted.length === 0 || wanted.includes(m.lang))
  if (!models.length) {
    console.error('No matching models. Known:', allSttModels().map((m) => m.lang).join(', '))
    process.exit(1)
  }

  let base = ''
  for (const m of models) {
    const pathname = `${PREFIX}/${m.file}`
    try {
      const existing = await head(pathname).catch(() => null)
      if (existing) {
        console.log(`✓ ${m.lang}: already uploaded — ${existing.url}`)
        base = existing.url.slice(0, existing.url.lastIndexOf('/'))
        continue
      }
      process.stdout.write(`↑ ${m.lang}: uploading ${m.file} … `)
      const { body } = await bodyFor(m.file)
      const result = await put(pathname, body, {
        access: 'public',
        addRandomSuffix: false, // stable, predictable URL
        allowOverwrite: true,
        contentType: 'application/gzip',
        multipart: true, // resilient for large files
      })
      base = result.url.slice(0, result.url.lastIndexOf('/'))
      console.log(`done — ${result.url}`)
    } catch (e) {
      console.log(`FAILED — ${(e as Error).message}`)
    }
  }

  if (base) {
    console.log(`\nSet this in your Vercel project env (Production + Preview), then redeploy:\n`)
    console.log(`  NEXT_PUBLIC_STT_MODEL_BASE=${base}\n`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
