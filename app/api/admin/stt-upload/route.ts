import { NextResponse, type NextRequest } from 'next/server'
import { put, head } from '@vercel/blob'
import { requireUser } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { allSttModels, sttModelFor, type SttModel } from '@/lib/sttModels'

// One-time, ADMIN-ONLY endpoint that populates the offline-STT (Vosk) models into
// the public Vercel Blob store. Uploads can't be done from a laptop here (the RW
// token is Sensitive and dev-OIDC is off), so this runs in the DEPLOYMENT, where
// Vercel injects a production OIDC token that can write to the store by id.
//
//   GET /api/admin/stt-upload            → upload all languages
//   GET /api/admin/stt-upload?lang=fr    → just one (use this if 'all' times out)
//
// It streams each archive straight from the upstream mirror into Blob (nothing is
// buffered), is idempotent (skips ones already present), and returns the exact
// NEXT_PUBLIC_STT_MODEL_BASE to set. Safe to leave deployed — it's admin-gated and
// does nothing once the store is populated. Runs on the Node runtime for streaming.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // capped by your plan; per-lang requests fit comfortably

const UPSTREAM = (process.env.STT_UPSTREAM_BASE || 'https://ccoreilly.github.io/vosk-browser/models').replace(/\/+$/, '')
const STORE_ID = process.env.STT_BLOB_STORE_ID || 'store_QD5tcagGOieYFSCG'

// Resolve Blob credentials for the TARGET public store:
//  • STT_BLOB_RW_TOKEN — an explicit read-write token, if you set one, else
//  • production OIDC — VERCEL_OIDC_TOKEN (auto-injected) + BLOB_STORE_ID. We drop
//    any other connected store's BLOB_READ_WRITE_TOKEN so the SDK can't target it.
function blobOptions(): { token?: string } {
  const explicit = process.env.STT_BLOB_RW_TOKEN
  if (explicit) return { token: explicit }
  delete process.env.BLOB_READ_WRITE_TOKEN
  process.env.BLOB_STORE_ID = STORE_ID
  return {}
}

export async function GET(req: NextRequest) {
  // Auth: either a logged-in admin, OR the CRON_SECRET (header `x-cron-secret`
  // or `?secret=`) so it can be triggered headlessly / verified via curl.
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  const viaSecret = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
  if (!viaSecret) {
    let email: string | null | undefined
    try {
      ({ supabaseUser: { email } } = (await requireUser()) as { supabaseUser: { email?: string | null } })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAdmin(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const langParam = req.nextUrl.searchParams.get('lang')
  const models: SttModel[] =
    langParam && langParam !== 'all'
      ? ([sttModelFor(langParam)].filter(Boolean) as SttModel[])
      : allSttModels()
  if (!models.length) return NextResponse.json({ error: `unknown lang '${langParam}'` }, { status: 400 })

  const opts = blobOptions()
  const results: Array<{ lang: string; status: string; url?: string; error?: string }> = []

  for (const m of models) {
    const pathname = `vosk/${m.file}`
    try {
      const existing = await head(pathname, opts).catch(() => null)
      if (existing) {
        results.push({ lang: m.lang, status: 'exists', url: existing.url })
        continue
      }
      const res = await fetch(`${UPSTREAM}/${m.file}`)
      if (!res.ok || !res.body) {
        results.push({ lang: m.lang, status: `upstream ${res.status}` })
        continue
      }
      const uploaded = await put(pathname, res.body, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/gzip',
        multipart: true,
        ...opts,
      })
      results.push({ lang: m.lang, status: 'uploaded', url: uploaded.url })
    } catch (e) {
      results.push({ lang: m.lang, status: 'error', error: (e as Error).message })
    }
  }

  const sample = results.find((r) => r.url)?.url
  const base = sample ? sample.slice(0, sample.lastIndexOf('/')) : null
  return NextResponse.json({
    store: STORE_ID,
    base,
    setEnv: base ? `NEXT_PUBLIC_STT_MODEL_BASE=${base}` : null,
    results,
  })
}
