/**
 * Authenticated end-to-end smoke test against the running dev server (port 3001).
 * Creates a throwaway Supabase user, signs in, crafts the @supabase/ssr session
 * cookie, then exercises the real API routes (review, AI example, chat, sentence,
 * placement). Cleans up the Supabase user at the end.
 *
 *     npx tsx scripts/e2e-smoke.ts
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE = process.env.E2E_BASE || 'http://localhost:3001'
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const REF = new URL(SUPA).host.split('.')[0]
const COOKIE_NAME = `sb-${REF}-auth-token`
const EMAIL = `langi-e2e-${Date.now()}@example.com`
const PASSWORD = 'Test1234!pass'

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log('  ✓', name, extra) }
  else { fail++; console.log('  ✗', name, extra) }
}

function buildCookie(session: unknown): string {
  // @supabase/ssr encodes the session as `base64-<base64url(JSON)>`, chunked at 3180 chars.
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  const CHUNK = 3180
  if (value.length <= CHUNK) return `${COOKIE_NAME}=${value}`
  const parts: string[] = []
  for (let i = 0, n = 0; i < value.length; i += CHUNK, n++) {
    parts.push(`${COOKIE_NAME}.${n}=${value.slice(i, i + CHUNK)}`)
  }
  return parts.join('; ')
}

let COOKIE = ''
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hit(method: string, path: string, body?: unknown): Promise<{ status: number; ok: boolean; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const text = await res.text()
  let data: unknown = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { _raw: text.slice(0, 80) } }
  return { status: res.status, ok: res.ok, data }
}

async function main() {
  // 1. Create + auto-confirm a throwaway user.
  const cr = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  })
  const crd = await cr.json()
  const userId = crd.id || crd.user?.id || ''
  check('admin create user', cr.ok && !!userId, `(${cr.status})`)

  // 2. Sign in → session → cookie.
  const tr = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const session = await tr.json()
  check('password sign-in', tr.ok && !!session.access_token, `(${tr.status})`)
  COOKIE = buildCookie(session)

  // 3. Review: due → answer wrong → answer correct.
  const due = await hit('GET', '/api/review/due?deckId=all&direction=recognition')
  const cardId = due.data.items?.[0]?.cardId || ''
  check('GET /api/review/due', due.ok && due.data.items?.length > 0, `(${due.status}, ${due.data.items?.length} due)`)

  const wrong = await hit('POST', '/api/review/answer', { cardId, answer: 'zzz-wrong', direction: 'recognition' })
  check('answer wrong → box 1 (+10min relearn)', wrong.ok && wrong.data.correct === false && wrong.data.newBox === 1, `(${wrong.status})`)

  const firstAlt = String(wrong.data.translation || '').split(/[/,;]/)[0].trim()
  const right = await hit('POST', '/api/review/answer', { cardId, answer: firstAlt, direction: 'recognition' })
  check('answer correct → box 2', right.ok && right.data.correct === true && right.data.newBox === 2, `(${right.status}, "${firstAlt}")`)

  // 4. AI example (real backend, cached on the card).
  const ex = await hit('POST', `/api/cards/${cardId}/example`)
  check('AI example', ex.ok && !!ex.data.exampleSentence, `(${ex.status}) "${String(ex.data.exampleSentence || '').slice(0, 36)}…"`)

  // 5. AI distractors (multiple-choice options).
  const dx = await hit('POST', `/api/cards/${cardId}/distractors`)
  check('AI distractors (MCQ options)', dx.ok && Array.isArray(dx.data.options) && dx.data.options.length === 4, `(${dx.status})`)

  // 6. AI chat: start conversation + one message.
  const cs = await hit('POST', '/api/chat/start', { mode: 'conversation' })
  check('chat start (random topic + opener)', cs.ok && !!cs.data.sessionId, `(${cs.status}) topic="${cs.data.topic}"`)
  if (cs.data.sessionId) {
    const cm = await hit('POST', '/api/chat/message', { sessionId: cs.data.sessionId, content: 'Bonjour ! Ça va bien.' })
    check('chat message (tutor reply)', cm.ok && !!cm.data.reply, `(${cm.status}) "${String(cm.data.reply || '').slice(0, 36)}…"`)
  }

  // 7. Sentence: prompt + grade.
  const sp = await hit('GET', '/api/sentences/prompt')
  check('sentence prompt', sp.ok && !!sp.data.prompt, `(${sp.status})`)
  if (sp.data.prompt) {
    const sg = await hit('POST', '/api/sentences/grade', { prompt: sp.data.prompt, sentence: "J'aime apprendre le français." })
    check('sentence grade', sg.ok && typeof sg.data.score === 'number', `(${sg.status}) score=${sg.data.score}`)
  }

  // 8. Placement: form + submit.
  const pf = await hit('GET', '/api/placement/form')
  check('placement form', pf.ok && pf.data.questions?.length > 0, `(${pf.status}, ${pf.data.questions?.length} Qs)`)
  if (pf.data.questions?.length) {
    // Answer A1 questions correctly, others wrong → expect ~A1.
    const answers = pf.data.questions.map((q: { id: string; level: string; options: string[] }) => ({ id: q.id, choice: q.level === 'A1' ? -1 : 0 }))
    const ps = await hit('POST', '/api/placement/submit', { answers })
    check('placement submit', ps.ok && !!ps.data.level, `(${ps.status}) level=${ps.data.level}`)
  }

  // 9. Tap-a-word: database first (curated deck → no AI), conjugations, save w/ source.
  const lk = await hit('POST', '/api/words/lookup', { term: 'pain' })
  check('lookup from curated deck (no AI)', lk.ok && lk.data.cached === true && /bread/i.test(lk.data.translation), `(${lk.status}) "${lk.data.translation}"`)
  const lc = await hit('POST', '/api/words/lookup', { term: 'sommes' })
  check('lookup conjugated verb via tables (no AI)', lc.ok && lc.data.cached === true && /être/.test(lc.data.translation), `(${lc.status}) "${lc.data.translation}"`)
  const sv = await hit('POST', '/api/words/save', { term: 'fromage', source: { kind: 'video', ref: 'e2eVideo01', t: 42, context: 'Le fromage est bon.' } })
  check('save word with video source', sv.ok && sv.data.saved === true, `(${sv.status})`)
  const vw = await hit('GET', '/api/videos/e2eVideo01/words')
  check('words from this video (with timestamp)', vw.ok && vw.data.words?.some((w: { term: string; t: number }) => w.term === 'fromage' && w.t === 42), `(${vw.status})`)

  // 10. Role-play debrief (AI).
  const rp = await hit('POST', '/api/chat/start', { mode: 'conversation', scenario: 'cafe' })
  if (rp.data.sessionId) {
    await hit('POST', '/api/chat/message', { sessionId: rp.data.sessionId, content: 'Bonjour, je voudrais un café et un croissant, s’il vous plaît.' })
    const db = await hit('POST', '/api/chat/debrief', { sessionId: rp.data.sessionId })
    check('role-play debrief scored', db.ok && typeof db.data.score === 'number' && db.data.goalsMet?.length === 3, `(${db.status}) score=${db.data.score}`)
  } else check('role-play start', false, `(${rp.status})`)

  // 11. Level-up test: form → failing submit → cooldown.
  const lf = await hit('GET', '/api/levelup/form')
  check('level-up form', lf.ok && lf.data.questions?.length >= 6, `(${lf.status}) ${lf.data.from}→${lf.data.target}, ${lf.data.questions?.length} Qs`)
  if (lf.data.questions?.length) {
    const ls = await hit('POST', '/api/levelup/submit', { answers: lf.data.questions.map((q: { id: string }) => ({ id: q.id, answer: '__wrong__' })) })
    check('level-up all-wrong → not passed', ls.ok && ls.data.passed === false, `(${ls.status})`)
    const again = await hit('GET', '/api/levelup/form')
    check('level-up retry cooldown', again.status === 429 && again.data.error === 'cooldown', `(${again.status})`)
  }

  // 12. League + friends.
  const lg = await hit('GET', '/api/league?scope=league')
  check('weekly league', lg.ok && Array.isArray(lg.data.rows) && lg.data.me?.xp > 0, `(${lg.status}) me=#${lg.data.me?.rank} ${lg.data.me?.xp}xp`)
  const fc = await hit('GET', '/api/friends')
  check('friend code minted', fc.ok && /^[A-Z0-9]{6}$/.test(fc.data.code), `(${fc.status}) ${fc.data.code}`)
  const self = await hit('POST', '/api/friends', { code: fc.data.code })
  check('cannot friend yourself', self.status === 404, `(${self.status})`)

  // 13. Cleanup.
  if (userId) {
    const del = await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    })
    check('cleanup: delete Supabase user', del.ok, `(${del.status})`)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('E2E failed:', e); process.exit(1) })
