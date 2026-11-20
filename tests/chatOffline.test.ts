import { describe, expect, it } from 'vitest'
import { isLocalId, newLocalChat, pendingChats, queueTurn, syncAll, syncChat } from '@/lib/chatOffline'

function fakeStore() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

/** A fake server: records calls; `failOn` makes the nth call (0-based) fail once. */
function fakeServer(failOn = -1) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  let n = 0
  const fetchFn = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (n++ === failOn) throw new Error('offline')
    calls.push({ url, body })
    return { ok: true, json: async () => ({ sessionId: 'S1' }) }
  }
  return { calls, fetchFn }
}

const turn = (c: string) => ({ content: c, ai: { reply: 'ok' } })
const starter = { opener: 'Bonjour !', translation: 'Hello!', suggestions: [] }

describe('offline chat queue', () => {
  it('creates local ids and keeps turns in order', () => {
    const store = fakeStore()
    const c = newLocalChat({ mode: 'conversation', topic: 'food', starter }, store)
    expect(isLocalId(c.id)).toBe(true)
    queueTurn(c.id, turn('un'), store)
    queueTurn(c.id, turn('deux'), store)
    expect(pendingChats(store)[0].turns.map((t) => t.content)).toEqual(['un', 'deux'])
  })

  it('syncs: creates the session once, then uploads each turn, then clears the queue', async () => {
    const store = fakeStore()
    const srv = fakeServer()
    const c = newLocalChat({ mode: 'conversation', topic: 'food', starter }, store)
    queueTurn(c.id, turn('un'), store)
    queueTurn(c.id, turn('deux'), store)
    expect(await syncChat(c.id, { fetchFn: srv.fetchFn, store })).toBe('S1')
    expect(srv.calls.map((x) => x.url)).toEqual(['/api/chat/start', '/api/chat/message', '/api/chat/message'])
    expect(srv.calls[1].body.sessionId).toBe('S1')
    expect(pendingChats(store)).toEqual([])
  })

  it('resumes after a failure without duplicating the session or a turn', async () => {
    const store = fakeStore()
    const c = newLocalChat({ mode: 'conversation', starter }, store)
    queueTurn(c.id, turn('un'), store)
    queueTurn(c.id, turn('deux'), store)
    const bad = fakeServer(2) // start ok, turn 1 ok, turn 2 fails
    expect(await syncChat(c.id, { fetchFn: bad.fetchFn, store })).toBeNull()
    expect(pendingChats(store)[0].sent).toBe(1)
    const good = fakeServer()
    expect(await syncChat(c.id, { fetchFn: good.fetchFn, store })).toBe('S1')
    expect(good.calls.map((x) => x.body.content)).toEqual(['deux'])
    expect(good.calls.every((x) => x.url === '/api/chat/message')).toBe(true)
  })

  it('queues turns for a server session that lost its connection, with no start call', async () => {
    const store = fakeStore()
    queueTurn('srv-ABC', turn('salut'), store)
    const srv = fakeServer()
    expect(await syncChat('srv-ABC', { fetchFn: srv.fetchFn, store })).toBe('ABC')
    expect(srv.calls).toHaveLength(1)
    expect(srv.calls[0].url).toBe('/api/chat/message')
    expect(srv.calls[0].body.sessionId).toBe('ABC')
  })

  it('syncAll skips the chat that is open on screen', async () => {
    const store = fakeStore()
    const a = newLocalChat({ mode: 'conversation', starter }, store)
    const b = newLocalChat({ mode: 'grammar', starter: null }, store)
    const srv = fakeServer()
    expect(await syncAll({ skip: a.id, fetchFn: srv.fetchFn, store })).toBe(1)
    expect(pendingChats(store).map((r) => r.id)).toEqual([a.id])
    expect(b.id).not.toBe(a.id)
  })
})
