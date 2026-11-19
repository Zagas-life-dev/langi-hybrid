'use client'
// Word endpoints answer 424 `needsAi` when the dictionary has no entry. This helper then
// translates the word in the browser through Firebase AI Logic (on-device first) and retries
// the same request with the result attached as `entry`.
import { translateWord } from './tutor'

export interface WordAiCtx { lang: string; nativeLang: string }

export async function postWithWordAi(
  url: string,
  body: Record<string, unknown>,
  ctx: WordAiCtx,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const send = async (b: Record<string, unknown>) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { res, data }
  }
  const first = await send(body)
  if (first.res.status !== 424 || !first.data.needsAi) return first

  const term = String(body.term ?? body.word ?? '').trim()
  let entry: Awaited<ReturnType<typeof translateWord>> = null
  try {
    entry = await translateWord(term, ctx.lang, ctx.nativeLang)
  } catch { /* fall through to the friendly error below */ }
  if (!entry) {
    return { res: first.res, data: { error: 'Translation is unavailable right now and this word isn’t in the dictionary yet.' } }
  }
  return send({ ...body, entry })
}
