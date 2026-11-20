'use client'
import { useEffect } from 'react'
import { requestSync } from '@/lib/offlineQueue'

/**
 * Registers the service worker for the whole app (not just push opt-in) so Langi
 * is installable and works offline, and flushes the offline review queue whenever
 * connectivity returns. Renders nothing.
 */
export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // In dev the worker fights HMR / Ctrl+Shift+R (stale chunks + HTML => reload
    // loops). Don't run it in dev: unregister any leftover one and drop its caches.
    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => caches.keys())
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith('langi-v')).map((k) => caches.delete(k))))
        .catch(() => {})
      return
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    const onOnline = () => requestSync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
