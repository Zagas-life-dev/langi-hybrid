'use client'
import { useSyncExternalStore } from 'react'
import { openLangiDB, STORE_REVIEWS as STORE } from '@/lib/offlineCards'

// ---------------------------------------------------------------------------
// Offline review queue (client side). When a review answer can't reach the
// server, we stash it in IndexedDB and ask the service worker to replay it via
// Background Sync; on browsers without Background Sync we flush on the next
// 'online' event. The DB (and its `reviews`/`cards`/`meta` stores) is defined
// once in lib/offlineCards.ts; the SW mirror of the schema lives in public/sw.js.
// ---------------------------------------------------------------------------

export interface QueuedReview {
  cardId: string
  answer: string
  direction: string
  spoken?: boolean
  /** On-device AI accepted an answer the rules marked wrong; replayed to the server as-is. */
  aiAccepted?: boolean
}

const openDB = openLangiDB

/** Persist a review answer to replay later, then nudge the SW to sync. */
export async function queueReview(body: QueuedReview): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add({ body, ts: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  await requestSync()
}

export async function pendingCount(): Promise<number> {
  try {
    const db = await openDB()
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).count()
      req.onsuccess = () => resolve(req.result || 0)
      req.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}

/** Register a one-off Background Sync, or fall back to a direct SW flush. */
export async function requestSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const withSync = reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } }
    if (withSync.sync) {
      await withSync.sync.register('langi-sync-reviews')
      return
    }
    reg.active?.postMessage({ type: 'langi-flush-reviews' })
  } catch {
    /* best-effort */
  }
}

/** React hook: live online/offline status. Uses useSyncExternalStore so the
 *  server snapshot is "online" (no hydration flash) and there's no setState-in-effect. */
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
