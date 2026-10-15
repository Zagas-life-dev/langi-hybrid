// Client-side subtitle state for the watch page, shared by the caption picker
// (study bar) and the overlay (inside the player) — siblings under a server
// page, so like the active-player registry they meet here instead of via props.
// The chosen languages are a per-viewer convenience kept in localStorage,
// keyed by target language so switching what you learn resets the defaults.

export type CaptionStatus = 'loading' | 'ok' | 'ai' | 'none' | 'limited'

interface State {
  selected: string[]
  status: Record<string, CaptionStatus>
  /** Underline words the learner doesn't know yet in the target-language line. */
  highlight: boolean
}

let state: State = { selected: [], status: {}, highlight: true }
let initFor: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const storageKey = (learning: string) => `langi:cc:${learning}`
const HIGHLIGHT_KEY = 'langi:cc-highlight'

export const MAX_CAPTION_LANGS = 3

/** Load the saved choice (default: target language + native language). Idempotent per target language. */
export function initCaptionPrefs(learning: string, native: string) {
  if (initFor === learning) return
  initFor = learning
  let saved: string[] | null = null
  try {
    const raw = localStorage.getItem(storageKey(learning))
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) saved = parsed.filter((x) => typeof x === 'string').slice(0, MAX_CAPTION_LANGS)
  } catch { /* storage unavailable */ }
  let highlight = true
  try { highlight = localStorage.getItem(HIGHLIGHT_KEY) !== '0' } catch { /* storage unavailable */ }
  state = { selected: saved ?? [...new Set([learning, native])], status: {}, highlight }
  emit()
}

export function getCaptionState(): State { return state }

export function subscribeCaptions(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function setSelectedCaptions(langs: string[]) {
  state = { ...state, selected: langs.slice(0, MAX_CAPTION_LANGS) }
  try { if (initFor) localStorage.setItem(storageKey(initFor), JSON.stringify(state.selected)) } catch { /* ignore */ }
  emit()
}

export function toggleCaption(lang: string) {
  const s = state.selected
  if (s.includes(lang)) setSelectedCaptions(s.filter((l) => l !== lang))
  else if (s.length < MAX_CAPTION_LANGS) setSelectedCaptions([...s, lang])
}

export function setCaptionStatus(lang: string, status: CaptionStatus) {
  if (state.status[lang] === status) return
  state = { ...state, status: { ...state.status, [lang]: status } }
  emit()
}

/** Reset per-video load status (the selection itself persists). */
export function resetCaptionStatus() {
  state = { ...state, status: {} }
  emit()
}

export function setHighlight(on: boolean) {
  state = { ...state, highlight: on }
  try { localStorage.setItem(HIGHLIGHT_KEY, on ? '1' : '0') } catch { /* ignore */ }
  emit()
}
