'use client'
// ---------------------------------------------------------------------------
// Offline flashcard deck (client side). We stash a pack of due cards — WITH the
// answer side and each card's tolerance — in IndexedDB while online, so a full
// review session runs with zero network: cards are read from here, graded on the
// device with the same pure SRS logic the server uses (srs-core), and the
// answer is queued (lib/offlineQueue.ts) to be re-graded authoritatively on
// reconnect. The SW mirrors this DB's schema in public/sw.js.
//
// This is deliberate LOCAL STORAGE, not HTTP cache: the deck survives restarts
// and is queryable, which the Cache API can't do.
// ---------------------------------------------------------------------------
import { checkAnswer, clozePrompt, grade, type ReviewDirection } from '@/lib/srs-core'
import type { AnswerTolerance } from '@/lib/models/Deck'

const DB_NAME = 'langi-offline'
const DB_VERSION = 3
export const STORE_REVIEWS = 'reviews'
const STORE_CARDS = 'cards'
const STORE_META = 'meta'
// v3 stores (offline data for the rest of the learning surface — lib/offlineData.ts).
export const STORE_MISTAKES = 'mistakes'
export const STORE_GRAMMARQ = 'grammarq'
export const STORE_DICTATION = 'dictation'
export const STORE_OUTBOX = 'outbox' // generic {endpoint, body} answer queue
const META_KEY = 'pack'

/** One offline card: everything needed to prompt AND grade without a server. */
export interface OfflineCard {
  cardId: string
  deckId: string
  languageCode: string
  term: string
  translation: string
  acceptedAnswers: string[]
  cloze?: string // sentence card: the blanked word (see srs-core clozePrompt)
  answerTolerance?: AnswerTolerance
  deckTolerance: AnswerTolerance
  partOfSpeech?: string
  gender?: string
  exampleSentence?: string
  exampleTranslation?: string
  tags: string[]
  box: number
  isNew: boolean
  dueAt: number // epoch ms
}

interface PackMeta {
  key: string
  learningLang: string
  nativeLang: string
  savedAt: number
}

/** Shape the review UI renders (mirrors /api/review/due's safe item). */
export interface DueItem {
  cardId: string
  box: number
  isNew: boolean
  prompt: string
  partOfSpeech?: string
  gender?: string
  answerLang: string
  tags: string[]
  cloze?: boolean
  hint?: string
}

// Shared opener — offlineQueue.ts imports this so the whole app touches one DB
// definition (the SW keeps its own copy since it can't import the bundle).
export function openLangiDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains(STORE_REVIEWS)) {
        db.createObjectStore(STORE_REVIEWS, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        db.createObjectStore(STORE_CARDS, { keyPath: 'cardId' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_MISTAKES)) {
        db.createObjectStore(STORE_MISTAKES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_GRAMMARQ)) {
        db.createObjectStore(STORE_GRAMMARQ, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_DICTATION)) {
        db.createObjectStore(STORE_DICTATION, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'id', autoIncrement: true })
      }
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
}

interface PackResponse {
  learningLang: string
  nativeLang: string
  cards: OfflineCard[]
}

/** Replace the cached deck with a freshly-fetched pack. */
export async function savePack(pack: PackResponse): Promise<void> {
  const db = await openLangiDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_CARDS, STORE_META], 'readwrite')
    const cards = tx.objectStore(STORE_CARDS)
    cards.clear()
    for (const c of pack.cards) cards.put(c)
    tx.objectStore(STORE_META).put({
      key: META_KEY,
      learningLang: pack.learningLang,
      nativeLang: pack.nativeLang,
      savedAt: Date.now(),
    } satisfies PackMeta)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Fetch the current pack from the server and cache it. Best-effort — returns the
 * cards on success (so the caller can also warm an in-memory map for a mid-session
 * disconnect) or null when offline/transient, leaving any existing cache intact.
 */
export async function refreshPack(deckId: string): Promise<OfflineCard[] | null> {
  try {
    const params = new URLSearchParams()
    if (deckId && deckId !== 'all') params.set('deckId', deckId)
    const res = await fetch(`/api/review/pack?${params}`)
    if (!res.ok) return null
    const data = (await res.json()) as PackResponse
    await savePack(data)
    return data.cards
  } catch {
    /* offline or transient — keep whatever we already cached */
    return null
  }
}

async function readAllCards(): Promise<OfflineCard[]> {
  const db = await openLangiDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_CARDS, 'readonly')
    const req = tx.objectStore(STORE_CARDS).getAll()
    req.onsuccess = () => resolve((req.result as OfflineCard[]) || [])
    req.onerror = () => resolve([])
  })
}

async function readMeta(): Promise<PackMeta | null> {
  const db = await openLangiDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_META, 'readonly')
    const req = tx.objectStore(STORE_META).get(META_KEY)
    req.onsuccess = () => resolve((req.result as PackMeta) || null)
    req.onerror = () => resolve(null)
  })
}

function promptFor(card: OfflineCard, direction: ReviewDirection): string {
  return direction === 'production' ? card.translation : card.term
}

/** Build the review queue from the cached deck — the offline twin of /api/review/due. */
export async function loadOfflineQueue(
  deckId: string,
  direction: ReviewDirection
): Promise<{ items: DueItem[]; cards: Map<string, OfflineCard>; meta: PackMeta | null }> {
  const [all, meta] = await Promise.all([readAllCards(), readMeta()])
  const now = Date.now()
  const learningLang = meta?.learningLang ?? 'fr'
  const nativeLang = meta?.nativeLang ?? 'en'

  const usable = all.filter(
    (c) =>
      (deckId === 'all' || c.deckId === deckId) && (c.isNew || c.dueAt <= now)
  )
  // Reviews-first (soonest due), then new — same ordering the server uses.
  usable.sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.dueAt - b.dueAt)

  const cards = new Map(all.map((c) => [c.cardId, c]))
  const items: DueItem[] = usable.map((card) => card.cloze ? {
    cardId: card.cardId,
    box: card.box,
    isNew: card.isNew,
    prompt: clozePrompt(card.term, card.cloze),
    hint: card.translation,
    cloze: true,
    answerLang: learningLang,
    tags: card.tags,
  } : {
    cardId: card.cardId,
    box: card.box,
    isNew: card.isNew,
    prompt: promptFor(card, direction),
    partOfSpeech: card.partOfSpeech,
    gender: direction === 'recognition' ? card.gender : undefined,
    answerLang: direction === 'production' ? learningLang : nativeLang,
    tags: card.tags,
  })
  return { items, cards, meta }
}

export interface LocalGrade {
  correct: boolean
  newBox: number
  correctAnswer: string
  term: string
  translation: string
  gender?: string
  exampleSentence?: string
  exampleTranslation?: string
}

/**
 * Grade a review on-device and persist the new Leitner state to the cached deck
 * so repeated offline sessions don't keep re-surfacing a card just answered.
 * Returns the same fields the server's /answer route sends, so the UI shows real
 * feedback (correct answer, translation, example) even fully offline.
 */
export async function gradeOffline(
  card: OfflineCard,
  answer: string,
  direction: ReviewDirection,
  spoken = false,
  aiAccepted = false
): Promise<LocalGrade> {
  const ruleCorrect = checkAnswer(
    { term: card.term, translation: card.translation, acceptedAnswers: card.acceptedAnswers, answerTolerance: card.answerTolerance, cloze: card.cloze },
    answer,
    direction,
    card.deckTolerance,
    spoken
  )
  // The on-device AI can rescue a typed synonym or slip the strict rules missed.
  const correct = ruleCorrect || (aiAccepted && !card.cloze && answer.trim().length > 0)
  // grade() is the single source of truth for the box/interval math; we persist
  // box + dueAt (streak/lapses/reps are recomputed authoritatively on sync).
  const g = grade({ box: card.box, correctStreak: 0, lapses: 0, reps: 0 }, correct)
  const newBox = g.box
  await updateCardState(card.cardId, newBox, g.dueAt.valueOf())

  return {
    correct,
    newBox,
    correctAnswer: card.cloze ?? (direction === 'production' ? card.term : card.translation),
    term: card.term,
    translation: card.translation,
    gender: card.gender,
    exampleSentence: card.exampleSentence,
    exampleTranslation: card.exampleTranslation,
  }
}

async function updateCardState(cardId: string, box: number, dueAt: number): Promise<void> {
  const db = await openLangiDB()
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_CARDS, 'readwrite')
    const store = tx.objectStore(STORE_CARDS)
    const get = store.get(cardId)
    get.onsuccess = () => {
      const c = get.result as OfflineCard | undefined
      if (c) store.put({ ...c, box, dueAt, isNew: false })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/** How many cards are cached for offline review (for a "ready offline" badge). */
export async function offlineCardCount(): Promise<number> {
  try {
    const db = await openLangiDB()
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_CARDS, 'readonly')
      const req = tx.objectStore(STORE_CARDS).count()
      req.onsuccess = () => resolve(req.result || 0)
      req.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}
