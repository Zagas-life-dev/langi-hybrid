/**
 * Gemini TTS quota check, across the whole fallback cascade.
 *
 * Google exposes NO "remaining quota" endpoint for AI Studio keys — the only
 * authoritative signal is what the API itself says when you call it. So this
 * script does three things:
 *
 *   1. Lists the TTS-capable models the key can actually see (free, no quota
 *      cost — a GET on the models endpoint is not metered against generation).
 *   2. Shows which models the app has PARKED after a 429, and until when
 *      (lib/expressiveTts.ts persists that in AiBackendState).
 *   3. Fires one tiny generation at each model in the cascade. A 200 means that
 *      model has quota right now; a 429 carries a QuotaFailure block naming the
 *      exact metric hit and its limit, which is the only place those numbers are
 *      ever published for your key.
 *
 * The live probe costs one request per model. Run:
 *   npm run tts-quota            # probe every model in the chain
 *   npm run tts-quota -- --dry   # no API calls; just show parked state
 */

import { connectDB } from '../lib/db'
import AiBackendState from '../lib/models/AiBackendState'
import { ttsModelChain, TTS_STYLES } from '../lib/expressiveTts'

// The probe must use the SAME prompt shape as production: the 2.5 TTS models
// reject a bare string with "tried to generate text" when there is no explicit
// read-this-aloud instruction, which would look like a broken model rather than
// a quota answer.
const PROBE_PROMPT = `${TTS_STYLES.clear}\n\nBonjour.`

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'

interface QuotaViolation {
  quotaMetric?: string
  quotaId?: string
  quotaValue?: string
  quotaDimensions?: Record<string, string>
}

interface ErrorDetail {
  '@type'?: string
  violations?: QuotaViolation[]
  retryDelay?: string
  links?: { description?: string; url?: string }[]
}

function key(): string {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!k) {
    console.error('GEMINI_API_KEY is not set — run via `npm run tts-quota` so .env.local is loaded.')
    process.exit(1)
  }
  return k
}

function human(ms: number): string {
  if (ms <= 0) return 'now'
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

/** Which TTS models this key can reach, and their token ceilings. */
async function listTtsModels(apiKey: string) {
  const res = await fetch(`${ENDPOINT}/models?key=${apiKey}&pageSize=200`)
  if (!res.ok) {
    console.log(`  (model list unavailable — HTTP ${res.status})`)
    return
  }
  const data = (await res.json()) as {
    models?: { name: string; inputTokenLimit?: number }[]
  }
  const tts = (data.models || []).filter((m) => /tts/i.test(m.name))
  if (!tts.length) {
    console.log('  (none visible to this key)')
    return
  }
  for (const m of tts) {
    const id = m.name.replace(/^models\//, '')
    console.log(`  ${id.padEnd(34)} input limit: ${m.inputTokenLimit ?? '?'} tokens`)
  }
}

/** Cooldowns the running app has recorded — what it will actually skip today. */
async function showParked(chain: string[]) {
  try {
    await connectDB()
  } catch (e) {
    console.log(`  (no database — ${(e as Error).message})`)
    return
  }
  const docs = await AiBackendState.find({ backend: { $in: chain.map((m) => `tts:${m}`) } }).lean()
  const byModel = new Map(docs.map((d) => [d.backend.replace(/^tts:/, ''), d.cooldownUntil]))
  for (const model of chain) {
    const until = byModel.get(model)
    const ms = until ? new Date(until).getTime() - Date.now() : 0
    console.log(
      ms > 0
        ? `  ${model.padEnd(34)} PARKED for ${human(ms)} (until ${new Date(until!).toLocaleString()})`
        : `  ${model.padEnd(34)} available`
    )
  }
}

/** One minimal generation. Status code + error body are the real quota report. */
async function probe(apiKey: string, model: string, voice: string) {
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROBE_PROMPT }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    })
  } catch (e) {
    console.log(`  ${model}\n    network error: ${(e as Error).message}`)
    return
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  if (res.ok) {
    const data = await res.json()
    const inline = data?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string } }) => p?.inlineData?.data
    )?.inlineData
    const bytes = inline?.data ? Buffer.from(inline.data, 'base64').length : 0
    console.log(`  ${model}`)
    console.log(`    OK — quota AVAILABLE (${elapsed}s, ${(bytes / 1024).toFixed(0)} KB ${inline?.mimeType || 'audio'})`)
    return
  }

  const body = await res.text().catch(() => '')
  let parsed: { error?: { message?: string; status?: string; details?: ErrorDetail[] } } | null = null
  try {
    parsed = JSON.parse(body)
  } catch {
    /* non-JSON error body — printed raw below */
  }

  console.log(`  ${model}`)
  console.log(`    HTTP ${res.status} ${parsed?.error?.status || ''} (${elapsed}s)`)

  const details = parsed?.error?.details || []
  const violations = details.flatMap((d) => d.violations || [])
  const message = parsed?.error?.message || ''

  // "limit: 0" on every violation is NOT an exhausted allowance — the tier grants
  // this model nothing. Requests are rejected at the quota gate without reaching
  // the model, so it also shows zero usage on the AI Studio dashboard. Saying
  // "cap spent" here would contradict the dashboard and send you hunting for
  // usage that never happened.
  if (violations.length && violations.every((v) => !v.quotaValue || v.quotaValue === '0') && /limit:\s*0\b/.test(message)) {
    const model = violations.find((v) => v.quotaDimensions?.model)?.quotaDimensions?.model
    console.log('    NOT AVAILABLE ON THIS TIER — free-tier limit is 0, needs billing enabled')
    console.log(`      never used, never usable${model ? `  [${model}]` : ''}; expect 0 usage on the dashboard`)
    return
  }

  for (const d of details) {
    // The QuotaFailure block is the payoff: it names the limit you actually hit.
    for (const v of d.violations || []) {
      const daily = /PerDay/i.test(v.quotaId || '')
      const period = daily ? '/day' : /PerMinute/i.test(v.quotaId || '') ? '/min' : ''
      console.log(`    ${daily ? 'DAILY CAP SPENT' : 'RATE LIMITED'}: ${v.quotaId || v.quotaMetric}`)
      console.log(`      limit: ${v.quotaValue ?? '?'}${period}${v.quotaDimensions?.model ? `  [${v.quotaDimensions.model}]` : ''}`)
    }
    if (d.retryDelay) console.log(`    API suggests retrying in ${d.retryDelay}`)
  }
  if (!details.length) console.log(`    ${(message || body).slice(0, 200)}`)
}

async function main() {
  const dry = process.argv.includes('--dry')
  const apiKey = key()
  const voice = process.env.GEMINI_TTS_VOICE || 'Kore'
  const chain = ttsModelChain()

  console.log(`\nGemini TTS quota   key ${apiKey.slice(0, 8)}…\n`)
  console.log(`Cascade (primary first): ${chain.join(' -> ')}\n`)

  console.log('TTS models visible to this key:')
  await listTtsModels(apiKey)

  console.log('\nApp-recorded cooldowns:')
  await showParked(chain)

  if (!dry) {
    console.log(`\nLive probe (voice ${voice}, 1 request per model):`)
    for (const model of chain) await probe(apiKey, model, voice)
  }

  console.log(
    '\nPer-minute / per-day counters and usage graphs:\n' +
      '  https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n' +
      '  (pick the project this API key belongs to)\n'
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
