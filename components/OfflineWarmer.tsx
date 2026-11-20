'use client'
import { useEffect } from 'react'
import { refreshPack } from '@/lib/offlineCards'
import { refreshBundle } from '@/lib/offlineData'

// Keeps the whole learning experience ready offline while the learner is online.
// It (1) waits until the service worker actually CONTROLS this page (so warmed
// fetches are cached, not raced past an inactive SW), (2) warms full-document
// copies of every learning page so they boot with no network, and (3) downloads
// the offline data bundle — flashcard pack + mistakes deck + grammar questions —
// into IndexedDB so "what I'm learning" is available offline. Re-runs on reconnect.
const LEARN_PAGES = [
  '/learn',
  '/learn/review/all',
  '/learn/mistakes',
  '/learn/grammar',
  '/learn/grammar/practice',
  '/learn/stories',
  '/learn/dictation',
  // Hybrid features that run on-device, so they should boot offline too.
  '/chat',
  '/sentences',
]

async function untilControlled(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    // Registered but not yet controlling this load — wait for it to take over so
    // our warm-up fetches pass through the SW and get cached.
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true })
      setTimeout(done, 4000) // fallback so we never hang
    })
  } catch {
    /* no SW — nothing to wait for */
  }
}

export default function OfflineWarmer() {
  useEffect(() => {
    let cancelled = false
    // Each warm-up renders every learning page on the server and re-downloads the card pack, and the
    // database meters reads, so do it at most once per WARM_EVERY (reconnecting after being offline
    // is the exception: that is exactly when the offline copy may be stale).
    const WARM_KEY = 'langi.warm.at'
    const WARM_EVERY = 20 * 60 * 1000
    const warm = async (force = false) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      try {
        if (!force && Date.now() - Number(localStorage.getItem(WARM_KEY) || 0) < WARM_EVERY) return
        localStorage.setItem(WARM_KEY, String(Date.now()))
      } catch { /* storage blocked: just warm */ }
      await untilControlled()
      if (cancelled) return
      // Warm each learning page's HTML so an offline navigation can be served
      // (SHELL_FALLBACKS in public/sw.js). Sequential-ish, best-effort.
      for (const p of LEARN_PAGES) {
        fetch(p, { credentials: 'same-origin' }).catch(() => {})
      }
      // Download the on-device datasets.
      refreshBundle().catch(() => {})
      refreshPack('all').catch(() => {})
    }
    const onOnline = () => { void warm(true) }
    void warm()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
    }
  }, [])
  return null
}
