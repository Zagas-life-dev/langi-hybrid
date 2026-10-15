// Langi service worker.
//  1. Web Push — OS notifications even when the tab is closed.
//  2. PWA offline — precache the offline page + icons, cache-first for immutable
//     build assets, and network-first-with-cache for pages/RSC so any screen the
//     learner has opened once online (dashboard, review) boots again offline.
//  3. Offline review sync — replays SRS answers the learner submitted while
//     offline (queued in IndexedDB by lib/offlineQueue.ts) once back online.
//
// The offline flashcard DECK itself is stored in the same IndexedDB (the `cards`
// store, written by lib/offlineCards.ts) so a full review session runs with no
// network — see ReviewSession.tsx.

// Bump this on any change to the caching strategy so old caches are dropped.
const CACHE = 'langi-v4'
// Registered as /sw.js?dev=1 by PWARegister under `next dev`, where build assets
// keep the same URL across edits. Cache-first would then pin stale CSS/JS, so in
// dev static files go network-first like pages (still cached for offline).
const DEV = new URL(self.location.href).searchParams.has('dev')
// Pages we treat as the offline "app shell": if a navigation fails offline and
// the exact page isn't cached, we serve one of these (cached from an online
// visit / warmed by components/OfflineWarmer) so the learner lands INSIDE the app
// — on their flashcards — instead of a dead-end offline page.
const SHELL_FALLBACKS = ['/learn/review/all', '/learn']
// Offline STT model archives (~40 MB) live in their own cache, written by
// lib/voskStt.ts. Never evict it on activate, and never route model requests
// through the page cache (see fetch handler) — the app layer owns them.
const STT_CACHE = 'langi-stt-v1'
const KEEP_CACHES = [CACHE, STT_CACHE]
const OFFLINE_URL = '/offline.html'
const PRECACHE = [
  OFFLINE_URL,
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
]

// ---------------------------------------------------------------------------
// Install / activate
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individual addAll rejects if ANY entry 404s; add tolerantly instead so a
      // single missing asset can't wedge the whole install.
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// ---------------------------------------------------------------------------
// Fetch strategy (GET, same-origin only):
//   • /api/*                     → passthrough (the page queues writes offline).
//   • /_next/static, icons, etc. → cache-first (immutable, content-hashed).
//   • everything else (pages,    → network-first: serve fresh when online and
//     RSC payloads, prefetches)     stash a copy; when offline serve the cached
//                                    copy, falling back to the offline page for
//                                    navigations.
// ---------------------------------------------------------------------------
function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // Self-hosted STT model archives are cached by the app (lib/voskStt.ts) in
  // their own store — don't let the page cache duplicate a 40 MB file.
  if (url.pathname.startsWith('/vosk/')) return

  if (isStatic(url) && !DEV) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
      )
    )
    return
  }

  // Pages, RSC payloads, prefetches → network-first, cache the success so the
  // same screen works offline next time; fall back to cache, then offline.html.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(async () => {
        // ignoreVary: Next tags responses with `Vary: RSC, Next-Router-*`, so a
        // plain match() misses a page cached under different router headers. We
        // want the bytes regardless of those headers.
        const cached = await caches.match(req, { ignoreVary: true })
        if (cached) return cached
        if (req.mode === 'navigate') {
          // Land the learner in the app (their cached flashcards) rather than a
          // dead-end. Try the review shell, then the dashboard, then offline.html.
          for (const path of SHELL_FALLBACKS) {
            const shell = await caches.match(path, { ignoreVary: true })
            if (shell) return shell
          }
          return caches.match(OFFLINE_URL)
        }
        return new Response('', { status: 504, statusText: 'Offline' })
      })
  )
})

// ---------------------------------------------------------------------------
// IndexedDB shared with the page (lib/offlineQueue.ts + lib/offlineCards.ts +
// lib/offlineData.ts). MUST match their schema/version exactly — the SW opens at
// the SAME version and creates every store, or a lower version would throw
// VersionError. v3 adds the mistakes/grammar/dictation caches + a generic
// `outbox` of queued answers the SW replays to their endpoints on reconnect.
// ---------------------------------------------------------------------------
const IDB_NAME = 'langi-offline'
const IDB_VERSION = 3
const STORE_REVIEWS = 'reviews'
const STORE_CARDS = 'cards'
const STORE_META = 'meta'
const STORE_MISTAKES = 'mistakes'
const STORE_GRAMMARQ = 'grammarq'
const STORE_DICTATION = 'dictation'
const STORE_OUTBOX = 'outbox'

function idbOpen() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, IDB_VERSION)
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

// Generic store helpers (used by the outbox flush).
function idbAllOf(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}
function idbDeleteOf(db, store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REVIEWS, 'readonly')
    const req = tx.objectStore(STORE_REVIEWS).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REVIEWS, 'readwrite')
    tx.objectStore(STORE_REVIEWS).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function flushReviews() {
  const db = await idbOpen()
  const items = await idbAll(db)
  for (const item of items) {
    try {
      const res = await fetch('/api/review/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
        credentials: 'same-origin',
      })
      if (res.ok) await idbDelete(db, item.id)
    } catch {
      // Still offline — leave it queued; sync will retry.
      break
    }
  }
  // Tell any open tab the queue changed so it can refresh its indicator.
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true })
  for (const c of clientsList) c.postMessage({ type: 'langi-sync-complete' })
}

// Replay queued answers for the mistakes / grammar decks to their own endpoints.
async function flushOutbox() {
  const db = await idbOpen()
  const items = await idbAllOf(db, STORE_OUTBOX)
  for (const item of items) {
    try {
      const res = await fetch(item.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
        credentials: 'same-origin',
      })
      if (res.ok) await idbDeleteOf(db, STORE_OUTBOX, item.id)
    } catch {
      break // still offline — retry on the next sync
    }
  }
}

async function flushAll() {
  await flushReviews()
  await flushOutbox()
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'langi-sync-reviews') event.waitUntil(flushAll())
})

// Page can also ask us to flush directly (browsers without Background Sync).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'langi-flush-reviews') event.waitUntil(flushAll())
})

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Langi', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Langi'
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    data: { url: data.url || '/learn' },
    badge: '/icon-192.png',
    icon: '/icon-192.png',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/learn'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(target).catch(() => {})
          }
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(target)
    })
  )
})
