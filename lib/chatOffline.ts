// Offline chat. With no connection, Langi still chats (Gemini Nano via Firebase AI Logic), so the
// conversation lives on this device and is uploaded when the learner is back online:
//   - a chat that BEGAN offline is a 'local-…' record: the server session is created at sync time;
//   - turns made while a SERVER session lost its connection queue under 'srv-<serverId>'.
// Progress is persisted after every upload, so a flaky reconnect never duplicates a message.

export interface PendingTurn { content: string; ai: unknown }

export interface PendingChat {
  id: string
  /** Set once the server session exists (always set for 'srv-…' records). */
  serverId?: string
  mode: 'conversation' | 'grammar'
  topic?: string
  scenario?: string
  starter: { opener: string; translation: string; suggestions: string[] } | null
  turns: PendingTurn[]
  /** How many of `turns` the server already has. */
  sent: number
  createdAt: number
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>

const KEY = 'langi.chat.pending'

function defaultStore(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function read(store: Store | null): PendingChat[] {
  if (!store) return []
  try {
    const v = JSON.parse(store.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

function write(list: PendingChat[], store: Store | null) {
  try { store?.setItem(KEY, JSON.stringify(list)) } catch { /* storage full or blocked: chat still works this session */ }
}

export const isLocalId = (id: string | null | undefined) => Boolean(id && id.startsWith('local-'))

export function pendingChats(store: Store | null = defaultStore()): PendingChat[] {
  return read(store)
}

export function newLocalChat(
  init: Pick<PendingChat, 'mode' | 'topic' | 'scenario' | 'starter'>,
  store: Store | null = defaultStore(),
): PendingChat {
  const rec: PendingChat = {
    ...init,
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    turns: [], sent: 0, createdAt: Date.now(),
  }
  write([...read(store), rec], store)
  return rec
}

/** Queue one finished turn on a local chat (`local-…`) or on a server session whose upload failed. */
export function queueTurn(id: string, turn: PendingTurn, store: Store | null = defaultStore()) {
  const list = read(store)
  let rec = list.find((r) => r.id === id)
  if (!rec) {
    // A server session that lost its connection: create the record on first use.
    rec = { id, serverId: id.replace(/^srv-/, ''), mode: 'conversation', starter: null, turns: [], sent: 0, createdAt: Date.now() }
    list.push(rec)
  }
  rec.turns.push(turn)
  write(list, store)
}

const inFlight = new Map<string, Promise<string | null>>()

/** Upload one record. Returns the server session id, or null if it could not finish (it stays queued). */
export function syncChat(id: string, opts: { fetchFn?: Fetch; store?: Store | null } = {}): Promise<string | null> {
  const running = inFlight.get(id)
  if (running) return running
  const p = doSync(id, opts).finally(() => inFlight.delete(id))
  inFlight.set(id, p)
  return p
}

async function doSync(id: string, opts: { fetchFn?: Fetch; store?: Store | null }): Promise<string | null> {
  const store = opts.store === undefined ? defaultStore() : opts.store
  const send: Fetch = opts.fetchFn ?? ((url, init) => fetch(url, init))
  const post = async (url: string, body: unknown) => {
    const res = await send(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) throw new Error('upload failed')
    return res.json() as Promise<Record<string, unknown>>
  }
  const save = (rec: PendingChat) => write(read(store).map((r) => (r.id === rec.id ? rec : r)), store)

  const rec = read(store).find((r) => r.id === id)
  if (!rec) return null
  try {
    if (!rec.serverId) {
      const data = await post('/api/chat/start', { mode: rec.mode, topic: rec.topic, scenario: rec.scenario, starter: rec.starter })
      rec.serverId = String(data.sessionId)
      save(rec)
    }
    for (let i = rec.sent; i < rec.turns.length; i++) {
      await post('/api/chat/message', { sessionId: rec.serverId, content: rec.turns[i].content, ai: rec.turns[i].ai })
      rec.sent = i + 1
      save(rec)
    }
  } catch {
    return null
  }
  write(read(store).filter((r) => r.id !== id), store)
  return rec.serverId ?? null
}

/** Upload every queued chat except `skip` (the one open on screen). Returns how many finished. */
export async function syncAll(opts: { skip?: string | null; fetchFn?: Fetch; store?: Store | null } = {}): Promise<number> {
  const store = opts.store === undefined ? defaultStore() : opts.store
  let done = 0
  for (const rec of read(store)) {
    if (rec.id === opts.skip) continue
    if (await syncChat(rec.id, { fetchFn: opts.fetchFn, store })) done++
  }
  return done
}
