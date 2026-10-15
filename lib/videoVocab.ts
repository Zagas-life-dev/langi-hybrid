'use client'
import { tokenKeys } from '@/lib/wordsCore'

// Per-video "what don't I know yet" data from /api/videos/[id]/vocab, shared by
// the subtitle overlay (highlighting) and the coverage line under the player.
// Fetched once per video per page; saving a word flips it to 'learning' here
// so the underline changes straight away.

export interface VideoVocab {
  coverage: number
  newWords: number
  words: Record<string, 'learning' | 'new'>
}

const data = new Map<string, VideoVocab | null>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function subscribeVideoVocab(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** undefined = not loaded yet, null = no target-language captions. */
export function getVideoVocab(videoId: string): VideoVocab | null | undefined {
  return data.get(videoId)
}

export function loadVideoVocab(videoId: string) {
  if (data.has(videoId) || inflight.has(videoId)) return
  inflight.add(videoId)
  fetch(`/api/videos/${videoId}/vocab`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d: VideoVocab | null) => {
      inflight.delete(videoId)
      data.set(videoId, d && typeof d.coverage === 'number' ? d : null)
      emit()
    })
}

/** The weakest status among a display token's keys ("l'amie" → amie). */
export function tokenStatus(v: VideoVocab | null | undefined, tok: string): 'learning' | 'new' | undefined {
  if (!v) return undefined
  let out: 'learning' | 'new' | undefined
  for (const k of tokenKeys(tok)) {
    const s = v.words[k]
    if (s === 'new') return 'new'
    if (s) out = s
  }
  return out
}

/** A word was just saved — it's now being learned, not unknown. */
export function markLearning(videoId: string, tok: string) {
  const v = data.get(videoId)
  if (!v) return
  const words = { ...v.words }
  let changed = false
  for (const k of tokenKeys(tok)) {
    if (words[k] === 'new') { words[k] = 'learning'; changed = true }
  }
  if (!changed) return
  data.set(videoId, { ...v, words, newWords: Math.max(0, v.newWords - 1) })
  emit()
}
