'use client'
// Firebase Remote Config for Langi's routing: change where each AI task runs, or flip the
// cloud kill switch, from the Firebase console, live, with no redeploy. Values are applied through
// setRouting() in ai.ts, so every call picks them up on the next request.
import { useSyncExternalStore } from 'react'
import { activate, fetchAndActivate, getAll, getRemoteConfig, onConfigUpdate, type RemoteConfig } from 'firebase/remote-config'
import { getHybridApp, firebaseConfigured } from './firebase'
import { setRouting } from './ai'
import { PARAM_DEFAULTS, parseRouting, type RoutingConfig } from './remoteCore'
import { setHudVisible } from './hud'

export interface RoutingStatus {
  /** 'defaults' = built-in values; 'remote' = values fetched from Firebase. */
  source: 'defaults' | 'remote'
  forceCloud: boolean
  /** When the values currently in use were applied. */
  at: number | null
}

const DEFAULT_STATUS: RoutingStatus = { source: 'defaults', forceCloud: false, at: null }
let status = DEFAULT_STATUS
const listeners = new Set<() => void>()

function publish(next: RoutingStatus) {
  status = next
  listeners.forEach((l) => l())
}

export function useRoutingStatus(): RoutingStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => status, () => DEFAULT_STATUS)
}

function apply(rc: RemoteConfig, source: RoutingStatus['source']) {
  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(getAll(rc))) raw[k] = v.asString()
  const cfg: RoutingConfig = parseRouting(raw)
  setRouting({ rules: cfg.rules, forceCloud: cfg.forceCloud })
  setHudVisible(cfg.showHud)
  publish({ source, forceCloud: cfg.forceCloud, at: Date.now() })
}

let started = false

/** Start once per page: fetch, apply, then listen for live changes. Safe to call repeatedly. */
export async function startRemoteRouting(): Promise<void> {
  if (started || !firebaseConfigured()) return
  started = true
  try {
    const rc = getRemoteConfig(getHybridApp())
    rc.defaultConfig = PARAM_DEFAULTS
    // Cheap to re-check; the realtime listener below makes changes appear without waiting for this.
    rc.settings.minimumFetchIntervalMillis = location.hostname === 'localhost' ? 0 : 5 * 60 * 1000
    apply(rc, 'defaults')
    const fetched = await fetchAndActivate(rc).catch(() => false)
    const ok = fetched || rc.lastFetchStatus === 'success' || rc.lastFetchStatus === 'throttle'
    apply(rc, ok ? 'remote' : 'defaults')

    // Live updates: the console publishes, we activate and apply, no reload needed.
    try {
      onConfigUpdate(rc, {
        next: () => { activate(rc).then(() => apply(rc, 'remote')).catch(() => {}) },
        error: () => { /* realtime needs a connection; the next fetch retries */ },
        complete: () => {},
      })
    } catch { /* older SDK or blocked socket: periodic fetch still works */ }
    window.addEventListener('online', () => { fetchAndActivate(rc).then(() => apply(rc, 'remote')).catch(() => {}) })
  } catch (e) {
    started = false
    console.warn('[hybrid] Remote Config unavailable, using built-in routing:', (e as Error).message)
  }
}
