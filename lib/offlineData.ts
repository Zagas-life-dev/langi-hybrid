'use client'
// ---------------------------------------------------------------------------
// Offline data for the whole learning surface beyond the flashcard pack
// (lib/offlineCards.ts): the mistakes deck, grammar-concept questions and
// dictation lines, plus a generic "outbox" that queues answer submissions to be
// replayed to their API when back online. Everything the learner needs to keep
// LEARNING with no network is stored here in IndexedDB; grading uses the same
// pure logic the server uses (srs-core), so it stays consistent on sync.
// ---------------------------------------------------------------------------
import {
  openLangiDB,
  STORE_MISTAKES,
  STORE_GRAMMARQ,
  STORE_DICTATION,
  STORE_OUTBOX,
} from '@/lib/offlineCards'
import { requestSync } from '@/lib/offlineQueue'

export interface OfflineMistake {
  id: string
  source: 'sentence' | 'chat' | 'review' | 'grammar'
  prompt: string
  answer: string
  userAnswer: string
  note: string
  box: number
}

export interface OfflineGrammarQ {
  id: string
  level: string
  concept: string
  prompt: string
  options: string[]
  box: number
  isNew: boolean
  // Answer side — cached so the MCQ can be graded on-device (mirrors the server).
  answerIndex: number
  explanation: string
}

export interface DictationLine {
  text: string
  translation: string
}

export interface OfflineBundle {
  learningLang: string
  nativeLang: string
  cefrLevel?: string | null
  mistakes: OfflineMistake[]
  grammarQuestions: OfflineGrammarQ[]
}

// --- generic helpers -------------------------------------------------------

async function putAll(store: string, clearFirst: boolean, rows: unknown[]): Promise<void> {
  const db = await openLangiDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    if (clearFirst) os.clear()
    for (const r of rows) os.put(r)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAll<T>(store: string): Promise<T[]> {
  try {
    const db = await openLangiDB()
    return await new Promise<T[]>((resolve) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAll()
      req.onsuccess = () => resolve((req.result as T[]) || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

// --- bundle (mistakes + grammar questions) ---------------------------------

/** Persist the mistakes + grammar-question decks fetched while online. */
export async function saveBundle(bundle: OfflineBundle): Promise<void> {
  await putAll(STORE_MISTAKES, true, bundle.mistakes)
  await putAll(STORE_GRAMMARQ, true, bundle.grammarQuestions)
}

/** Fetch the offline bundle from the server and cache it. Best-effort. */
export async function refreshBundle(): Promise<boolean> {
  try {
    const res = await fetch('/api/offline/bundle', { credentials: 'same-origin' })
    if (!res.ok) return false
    const data = (await res.json()) as OfflineBundle
    await saveBundle(data)
    return true
  } catch {
    return false
  }
}

export function loadOfflineMistakes(): Promise<OfflineMistake[]> {
  return getAll<OfflineMistake>(STORE_MISTAKES)
}

export function loadOfflineGrammar(): Promise<OfflineGrammarQ[]> {
  return getAll<OfflineGrammarQ>(STORE_GRAMMARQ)
}

// --- dictation (cached lines, keyed singleton) -----------------------------

const DICTATION_KEY = 'lines'

export async function saveDictationLines(lines: DictationLine[]): Promise<void> {
  if (!lines.length) return
  await putAll(STORE_DICTATION, false, [{ key: DICTATION_KEY, lines, savedAt: Date.now() }])
}

export async function loadDictationLines(): Promise<DictationLine[]> {
  const rows = await getAll<{ key: string; lines: DictationLine[] }>(STORE_DICTATION)
  return rows.find((r) => r.key === DICTATION_KEY)?.lines ?? []
}

// --- generic outbox (queue answers → replay to their endpoint on reconnect) --

/** Queue an answer submission to be POSTed to `endpoint` when back online. */
export async function queueOutbox(endpoint: string, body: unknown): Promise<void> {
  const db = await openLangiDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, 'readwrite')
    tx.objectStore(STORE_OUTBOX).add({ endpoint, body, ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  await requestSync()
}
