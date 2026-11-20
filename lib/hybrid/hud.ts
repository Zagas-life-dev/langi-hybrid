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
  listeners.forEach((l) => l())
  return ev
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

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
