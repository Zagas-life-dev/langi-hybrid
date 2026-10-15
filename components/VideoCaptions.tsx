'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Captions, Check, Loader2, Maximize, TextQuote } from 'lucide-react'
import { getActivePlayer, subscribeActivePlayer, WORD_SAVED_EVENT, type YTPlayer } from '@/lib/ytPlayer'
import {
  initCaptionPrefs, getCaptionState, subscribeCaptions, toggleCaption, setSelectedCaptions,
  setCaptionStatus, resetCaptionStatus, setHighlight, MAX_CAPTION_LANGS, type CaptionStatus,
} from '@/lib/captionPrefs'
import { getVideoVocab, subscribeVideoVocab, loadVideoVocab, tokenStatus, markLearning } from '@/lib/videoVocab'
import { langName } from '@/lib/langs'
import { SWEET_SPOT } from '@/lib/wordsCore'
import { useWordLookup, TappableText, WordLookupCard } from '@/components/WordLookup'

// Multi-language subtitles for the watch page: the overlay renders every chosen
// language at once over the video (target language on top, tappable for word
// lookup), and the picker in the study bar chooses which languages show.

interface Cue { start: number; end: number; text: string }
interface Track { code: string; name: string; auto: boolean }

export const playerBoxId = (videoId: string) => `player-${videoId}`

const noopSubscribe = () => () => {}
const useCaptionState = () => useSyncExternalStore(subscribeCaptions, getCaptionState, getCaptionState)
const useVideoVocab = (videoId: string) =>
  useSyncExternalStore(subscribeVideoVocab, () => getVideoVocab(videoId), () => undefined)

// Words not known yet, on the black subtitle band: solid amber = never met,
// dotted blue = in your deck but not solid yet.
const STATUS_CLASS = {
  new: 'underline decoration-amber-400 decoration-2 underline-offset-4',
  learning: 'underline decoration-sky-300 decoration-dotted decoration-2 underline-offset-4',
} as const

/** Target language first, then native, then the rest — regardless of tap order. */
function ordered(selected: string[], learning: string, native: string): string[] {
  const rank = (l: string) => (l === learning ? 0 : l === native ? 1 : 2)
  return [...selected].sort((a, b) => rank(a) - rank(b))
}

/** The cue playing at `t` (cues are sorted by start). */
function cueAt(cues: Cue[] | undefined, t: number): Cue | null {
  if (!cues?.length) return null
  let lo = 0, hi = cues.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (cues[mid].start <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found >= 0 && t < cues[found].end ? cues[found] : null
}

function setNativeCaptions(player: YTPlayer, lang: string | null) {
  try {
    if (!lang) player.unloadModule?.('captions')
    else {
      player.loadModule?.('captions')
      player.setOption?.('captions', 'track', { languageCode: lang })
    }
  } catch { /* player not ready / module missing */ }
}

export function CaptionOverlay({ videoId, learning, native }: { videoId: string; learning: string; native: string }) {
  const { selected, status, highlight } = useCaptionState()
  const vocab = useVideoVocab(videoId)
  const player = useSyncExternalStore(subscribeActivePlayer, () => getActivePlayer(videoId), () => null)
  const [cues, setCues] = useState<Record<string, Cue[]>>({})
  const [now, setNow] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const requested = useRef(new Set<string>())
  const wordLookup = useWordLookup()
  // The line the looked-up word came from, for "Save line" (sentence mining).
  const [tappedCue, setTappedCue] = useState<Cue | null>(null)
  const [lineSave, setLineSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => { initCaptionPrefs(learning, native) }, [learning, native])

  useEffect(() => { resetCaptionStatus() }, [videoId])
  useEffect(() => { if (highlight) loadVideoVocab(videoId) }, [highlight, videoId])
  const cuesFor = (lang: string) => cues[`${videoId}:${lang}`]

  // Fetch each chosen language once per video. AI translations come in parts:
  // show the first as soon as it lands, then keep appending the rest.
  useEffect(() => {
    async function load(lang: string, key: string) {
      setCaptionStatus(lang, 'loading')
      for (let part = 0; ; part++) {
        let r: Response, d: { cues?: Cue[]; source?: string; parts?: number }
        try {
          r = await fetch(`/api/videos/${videoId}/captions?lang=${encodeURIComponent(lang)}&part=${part}`)
          d = await r.json().catch(() => ({}))
        } catch {
          if (part === 0) { requested.current.delete(key); setCaptionStatus(lang, 'none') }
          return
        }
        if (!r.ok || !d.cues?.length) {
          if (part === 0) {
            setCaptionStatus(lang, r.status === 429 ? 'limited' : 'none')
            if (r.status === 429) requested.current.delete(key) // retry on next toggle
          }
          return
        }
        const got = d.cues
        setCues((c) => ({ ...c, [key]: part === 0 ? got : [...(c[key] ?? []), ...got] }))
        setCaptionStatus(lang, d.source === 'ai' ? 'ai' : 'ok')
        if (d.source !== 'ai' || !d.parts || part + 1 >= d.parts) return
      }
    }
    for (const lang of selected) {
      const key = `${videoId}:${lang}`
      if (requested.current.has(key)) continue
      requested.current.add(key)
      load(lang, key)
    }
  }, [selected, videoId])

  // Our overlay replaces YouTube's single-track CC; fall back to it only when
  // none of the chosen languages could be loaded.
  const showing = selected.filter((l) => cuesFor(l)?.length)
  const settled = selected.every((l) => status[l] && status[l] !== 'loading')
  const nativeCc = selected.length && !showing.length && settled ? selected[0] : null
  const nativeRef = useRef(nativeCc)
  useEffect(() => {
    nativeRef.current = nativeCc
    if (player) setNativeCaptions(player, nativeCc)
  }, [player, nativeCc])

  // Follow playback. YouTube can re-enable its captions when playback starts,
  // so re-apply our choice whenever the player starts playing.
  useEffect(() => {
    if (!player) return
    let wasPlaying = false
    const id = setInterval(() => {
      try {
        const playing = player.getPlayerState() === 1
        if (playing && !wasPlaying) setNativeCaptions(player, nativeRef.current)
        wasPlaying = playing
        const t = player.getCurrentTime()
        setNow((p) => (Math.abs(p - t) > 0.05 ? t : p))
      } catch { /* player gone */ }
    }, 250)
    return () => clearInterval(id)
  }, [player])

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement?.id === playerBoxId(videoId))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [videoId])

  function tapWord(word: string, cue: Cue) {
    try { player?.pauseVideo() } catch { /* ignore */ }
    setTappedCue(cue)
    setLineSave('idle')
    wordLookup.open(word, { kind: 'video', ref: videoId, t: Math.floor(cue.start), context: cue.text })
  }

  async function saveWord() {
    const term = wordLookup.lookup?.term
    await wordLookup.save()
    if (term) markLearning(videoId, term)
    window.dispatchEvent(new Event(WORD_SAVED_EVENT))
  }

  /** Save the tapped line as a fill-in-the-blank card, the tapped word blanked. */
  async function saveLine() {
    const term = wordLookup.lookup?.term
    if (!term || !tappedCue || lineSave === 'saving' || lineSave === 'saved') return
    setLineSave('saving')
    // The learner's-language line at the same moment is the card's hint.
    const meaning = native !== learning ? cueAt(cuesFor(native), (tappedCue.start + tappedCue.end) / 2)?.text : undefined
    try {
      const res = await fetch('/api/words/save-sentence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentence: tappedCue.text, word: term, meaning,
          source: { kind: 'video', ref: videoId, t: Math.floor(tappedCue.start), context: tappedCue.text },
        }),
      })
      setLineSave(res.ok ? 'saved' : 'error')
      if (res.ok) {
        markLearning(videoId, term)
        window.dispatchEvent(new Event(WORD_SAVED_EVENT))
      }
    } catch { setLineSave('error') }
  }

  const wordClass = highlight && vocab
    ? (tok: string) => { const s = tokenStatus(vocab, tok); return s ? STATUS_CLASS[s] : undefined }
    : undefined

  const lines = ordered(showing, learning, native)
    .map((lang) => ({ lang, cue: cueAt(cuesFor(lang), now) }))
    .filter((x): x is { lang: string; cue: Cue } => Boolean(x.cue))

  return (
    <>
      <div className={`absolute inset-x-0 flex flex-col items-center gap-1 px-3 pointer-events-none ${fullscreen ? 'bottom-[10%]' : 'bottom-[15%]'}`}>
        {lines.map(({ lang, cue }) => {
          const target = lang === learning
          const size = target
            ? (fullscreen ? 'text-2xl md:text-4xl' : 'text-sm md:text-xl')
            : (fullscreen ? 'text-lg md:text-2xl' : 'text-xs md:text-base')
          return (
            <p key={lang} lang={lang}
              className={`max-w-[92%] text-center leading-snug px-2 py-0.5 bg-black/75 ${target ? 'text-white pointer-events-auto' : 'text-white/80'} ${size}`}>
              {target
                ? <TappableText text={cue.text} onWord={(w) => tapWord(w, cue)} activeTerm={wordLookup.lookup?.term} wordClass={wordClass} />
                : cue.text}
            </p>
          )
        })}
      </div>
      <WordLookupCard lookup={wordLookup.lookup} onSave={saveWord} onClose={wordLookup.close} floating
        extra={tappedCue && (
          <button onClick={saveLine} disabled={lineSave === 'saving' || lineSave === 'saved'}
            title="Save this whole line as a fill-in-the-blank card"
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold transition-colors ${
              lineSave === 'saved' ? 'border-ok text-ok' : lineSave === 'error' ? 'border-accent2 text-accent2' : 'border-line hover:bg-paper-dark'
            }`}>
            {lineSave === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : lineSave === 'saved' ? <Check className="w-3.5 h-3.5" /> : <TextQuote className="w-3.5 h-3.5" strokeWidth={2.2} />}
            {lineSave === 'saved' ? 'Line saved' : lineSave === 'error' ? 'Retry' : 'Save line'}
          </button>
        )} />
    </>
  )
}

const STATUS_LABEL: Partial<Record<CaptionStatus, string>> = {
  ai: 'AI-translated',
  none: 'Not available',
  limited: 'Limit reached',
}

export function CaptionPicker({ videoId, learning, native }: { videoId: string; learning: string; native: string }) {
  const { selected, status, highlight } = useCaptionState()
  const [open, setOpen] = useState(false)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const canFullscreen = useSyncExternalStore(noopSubscribe, () => Boolean(document.fullscreenEnabled), () => false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { initCaptionPrefs(learning, native) }, [learning, native])

  useEffect(() => {
    if (!open || tracks) return
    fetch(`/api/videos/${videoId}/captions`)
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((d) => setTracks(d.tracks || []))
      .catch(() => setTracks([]))
  }, [open, tracks, videoId])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const hasTrack = (code: string) => tracks?.find((t) => t.code === code)
  const options = [
    { code: learning, label: langName(learning), hint: 'learning' },
    ...(native !== learning ? [{ code: native, label: langName(native), hint: 'your language' }] : []),
    ...(tracks ?? [])
      .filter((t) => t.code !== learning && t.code !== native)
      .map((t) => ({ code: t.code, label: t.name.replace(/\s*\(auto-generated\)/i, ''), hint: '' })),
  ]

  function note(code: string): string {
    const s = status[code]
    if (s === 'loading') return ''
    if (s && STATUS_LABEL[s]) return STATUS_LABEL[s]!
    if (!tracks) return ''
    const t = hasTrack(code)
    if (!t) return tracks.length ? 'AI translation' : 'Not available'
    return t.auto ? 'Auto-generated' : ''
  }

  function fullscreen() {
    document.getElementById(playerBoxId(videoId))?.requestFullscreen?.().catch(() => {})
  }

  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 border-2 border-line rounded-full text-xs font-bold transition-colors hover:bg-paper-dark'
  const full = selected.length >= MAX_CAPTION_LANGS

  return (
    <>
      <div ref={boxRef} className="relative">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${btn} ${selected.length ? '' : 'text-muted'}`}
          title="Choose subtitle languages">
          <Captions className="w-3.5 h-3.5" strokeWidth={2.2} />
          {selected.length ? ordered(selected, learning, native).map((l) => l.toUpperCase()).join(' + ') : 'CC off'}
        </button>
        {open && (
          <div className="absolute z-30 left-0 mt-1 w-72 max-w-[calc(100vw-2rem)] border-[2.5px] border-line rounded-[32px] bg-paper-raised shadow-(--shadow-lg) p-2 text-sm">
            <p className="meta text-muted px-2 pb-2">Subtitles · up to {MAX_CAPTION_LANGS} at once</p>
            <ul className="max-h-72 overflow-y-auto">
              {options.map((o) => {
                const on = selected.includes(o.code)
                const disabled = !on && full
                return (
                  <li key={o.code}>
                    <button onClick={() => toggleCaption(o.code)} disabled={disabled} aria-pressed={on}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-paper-dark disabled:opacity-40">
                      <span className={`w-4 h-4 shrink-0 border flex items-center justify-center ${on ? 'bg-ink border-ink text-paper' : 'border-line'}`}>
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {o.label}{o.hint && <span className="text-muted"> · {o.hint}</span>}
                      </span>
                      {on && status[o.code] === 'loading'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
                        : <span className="meta text-muted shrink-0">{note(o.code)}</span>}
                    </button>
                  </li>
                )
              })}
              {!tracks && <li className="px-2 py-1.5 text-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding more languages…</li>}
            </ul>
            <label className="flex items-center gap-2 border-t border-line mt-2 pt-2 px-2 cursor-pointer">
              <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-accent" />
              <span className="flex-1">Underline words I don&apos;t know</span>
            </label>
            <div className="flex justify-between gap-2 border-t border-line mt-2 pt-2 px-2">
              <button onClick={() => setSelectedCaptions([])} className="meta text-muted hover:text-accent">Turn off</button>
              <button onClick={() => setSelectedCaptions([...new Set([learning, native])])} className="meta text-muted hover:text-accent">Reset to default</button>
            </div>
          </div>
        )}
      </div>
      {canFullscreen && (
        <button onClick={fullscreen} className={btn} title="Full screen with subtitles">
          <Maximize className="w-3.5 h-3.5" strokeWidth={2.2} />
        </button>
      )}
    </>
  )
}

/** "You know ~87% of the words" under the player, with the highlight legend. */
export function VideoCoverage({ videoId }: { videoId: string }) {
  const vocab = useVideoVocab(videoId)
  const { highlight } = useCaptionState()
  useEffect(() => { loadVideoVocab(videoId) }, [videoId])
  if (!vocab) return null
  const pct = Math.floor(vocab.coverage * 100)
  const band = vocab.coverage > SWEET_SPOT.max ? 'easy listening' : vocab.coverage >= SWEET_SPOT.min ? 'just right for you' : 'a stretch — lean on the subtitles'
  return (
    <p className="meta text-muted mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span><span className="text-ink">You know ~{pct}% of the words</span> · {band}</span>
      {vocab.newWords > 0 && <span>{vocab.newWords} new word{vocab.newWords === 1 ? '' : 's'}</span>}
      {highlight && (
        <span className="inline-flex items-center gap-3 normal-case">
          <span className={STATUS_CLASS.new}>new</span>
          <span className={STATUS_CLASS.learning}>learning</span>
        </span>
      )}
    </p>
  )
}
