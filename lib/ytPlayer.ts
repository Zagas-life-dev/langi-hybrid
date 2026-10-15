// Shared YouTube IFrame Player API loader + minimal typings, used by both the
// Shorts player and the watch-page player so the API script loads exactly once.

export interface YTPlayer {
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  getPlayerState: () => number
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate?: (rate: number) => void
  getPlaybackRate?: () => number
  // Undocumented but long-standing captions module controls.
  loadModule?: (name: string) => void
  unloadModule?: (name: string) => void
  setOption?: (module: string, option: string, value: unknown) => void
  destroy: () => void
}
export interface YTPlayerEvent { target: YTPlayer; data: number }
export interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number }
}
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }

let apiPromise: Promise<void> | null = null

/** Resolve once the IFrame API is ready. Injects the script a single time. */
export function loadYT(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as YTWindow
  if (w.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve() }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

export function ytNamespace(): YTNamespace | undefined {
  return typeof window === 'undefined' ? undefined : (window as YTWindow).YT
}

/** Fire-and-forget: mark a video finished so it feeds recommendations. */
export function reportComplete(videoId: string) {
  fetch(`/api/videos/${videoId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => {})
}

// --- Active watch-page player ----------------------------------------------
// The watch page has one main player; study tools (speed, replay, A-B loop) and
// "save word at this moment" live in sibling components, so the player
// registers itself here instead of threading a ref through the server page.

let active: { videoId: string; player: YTPlayer } | null = null
const listeners = new Set<() => void>()

export function registerActivePlayer(videoId: string, player: YTPlayer | null) {
  if (player) active = { videoId, player }
  else if (active?.videoId === videoId) active = null
  listeners.forEach((l) => l())
}

export function getActivePlayer(videoId: string): YTPlayer | null {
  return active?.videoId === videoId ? active.player : null
}

/** Subscribe to the active player appearing/disappearing (for useSyncExternalStore). */
export function subscribeActivePlayer(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Current playback second of the watch-page player, if it's ready. */
export function activeTime(videoId: string): number | undefined {
  try {
    const t = getActivePlayer(videoId)?.getCurrentTime()
    return typeof t === 'number' && Number.isFinite(t) ? Math.floor(t) : undefined
  } catch {
    return undefined
  }
}

/** Fired after a word is saved from a video so "Words from this video" refreshes. */
export const WORD_SAVED_EVENT = 'langi:word-saved'
