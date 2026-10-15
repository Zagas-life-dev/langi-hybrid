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
    // In dev, build assets aren't content-hashed, so the worker runs in a
    // network-first mode (see sw.js) instead of pinning stale CSS/JS.
    const url = process.env.NODE_ENV === 'development' ? '/sw.js?dev=1' : '/sw.js'
    navigator.serviceWorker.register(url).catch(() => {})
    const onOnline = () => requestSync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  return null
}
