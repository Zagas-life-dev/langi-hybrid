'use client'
// Session store for the Hybrid HUD: every AI call records where it ran and what it saved.
import { useSyncExternalStore } from 'react'
import type { HybridTask } from './tasks'

export type Source = 'ON_DEVICE' | 'IN_CLOUD'

export interface HybridEvent {
  id: number
  task: HybridTask
  source: Source
  reason: string
  ms: number
  savedBytes: number
  savedUsd: number
  at: number
}

export interface HudState {
  events: HybridEvent[]
  onDevice: number
  cloud: number
  savedBytes: number
  savedUsd: number
}

const EMPTY: HudState = { events: [], onDevice: 0, cloud: 0, savedBytes: 0, savedUsd: 0 }
let state: HudState = EMPTY
let nextId = 1
const listeners = new Set<() => void>()

export function recordEvent(e: Omit<HybridEvent, 'id' | 'at'>): HybridEvent {
  const ev: HybridEvent = { ...e, id: nextId++, at: Date.now() }
  const onDevice = ev.source === 'ON_DEVICE'
  state = {
    events: [ev, ...state.events].slice(0, 50),
    onDevice: state.onDevice + (onDevice ? 1 : 0),
    cloud: state.cloud + (onDevice ? 0 : 1),
    savedBytes: state.savedBytes + (onDevice ? ev.savedBytes : 0),
    savedUsd: state.savedUsd + (onDevice ? ev.savedUsd : 0),
  }
  bumpLife(ev)
  listeners.forEach((l) => l())
  return ev
}

// --- Lifetime totals (this browser) ------------------------------------------
// The session counter resets on reload; these keep running so the HUD can say what Langi has
// saved overall. Per-user totals in the account database come with the Firebase data move.
export interface HudTotals { onDevice: number; cloud: number; savedBytes: number; savedUsd: number }
const LIFE_KEY = 'langi.hud.lifetime'
const ZERO: HudTotals = { onDevice: 0, cloud: 0, savedBytes: 0, savedUsd: 0 }
let lifetime: HudTotals = ZERO
let lifeLoaded = false

function loadLife() {
  if (lifeLoaded || typeof window === 'undefined') return
  lifeLoaded = true
  try {
    const j = JSON.parse(localStorage.getItem(LIFE_KEY) || 'null')
    if (j && typeof j.onDevice === 'number') lifetime = { ...ZERO, ...j }
  } catch { /* private mode: lifetime just starts at zero */ }
}

function bumpLife(ev: HybridEvent) {
  loadLife()
  const local = ev.source === 'ON_DEVICE'
  lifetime = {
    onDevice: lifetime.onDevice + (local ? 1 : 0),
    cloud: lifetime.cloud + (local ? 0 : 1),
    savedBytes: lifetime.savedBytes + (local ? ev.savedBytes : 0),
    savedUsd: lifetime.savedUsd + (local ? ev.savedUsd : 0),
  }
  try { localStorage.setItem(LIFE_KEY, JSON.stringify(lifetime)) } catch { /* ignore */ }
}

export function useLifetime(): HudTotals {
  return useSyncExternalStore(subscribe, () => { loadLife(); return lifetime }, () => ZERO)
}

/** Current HUD snapshot for non-React callers. */
export function getHud(): HudState {
  return state
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useHud(): HudState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}

export function formatUsd(n: number) {
  if (n === 0) return '$0'
  return n < 0.01 ? '<$0.01' : '$' + n.toFixed(2)
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
