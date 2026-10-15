/**
 * Smoke-test the real Mistral + Gemini chat backends (same calls lib/ai.ts makes).
 * Run from langi/:  npx tsx scripts/verify-ai.ts
 * Makes a tiny JSON-mode request to each configured backend.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

const SYS = 'You are a French teacher. Reply ONLY as JSON: {"example":"<short French sentence>","translation":"<English>"}'
const USER = 'Word: "bonjour" (means: hello)'

async function mistral(): Promise<string> {
  const key = process.env.MISTRAL_API_KEY!
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: USER }] as Msg[],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 200,
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
  const d = await r.json()
  return d?.choices?.[0]?.message?.content ?? ''
}

async function gemini(): Promise<string> {
  const key = process.env.GEMINI_API_KEY!
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYS }] },
      contents: [{ role: 'user', parts: [{ text: USER }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.5, maxOutputTokens: 200 },
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`)
  const d = await r.json()
  return (d?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
}

async function main() {
  const order = (process.env.AI_CHAT_BACKENDS || 'mistral,gemini').split(',').map((s) => s.trim())
  console.log('Cascade order:', order.join(' -> '))
  for (const name of order) {
    process.stdout.write(`\n[${name}] `)
    try {
      const out = name === 'mistral' ? await mistral() : await gemini()
      console.log('OK ->', out.replace(/\s+/g, ' ').slice(0, 160))
    } catch (e) {
      console.log('FAIL ->', (e as Error).message)
    }
  }
}

main()
