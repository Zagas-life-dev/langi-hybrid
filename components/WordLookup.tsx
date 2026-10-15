'use client'
import { useCallback, useRef, useState } from 'react'
import { BookmarkPlus, Check, Volume2, X, Loader2 } from 'lucide-react'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import type { CardSource } from '@/lib/models/Card'

// Tap-a-word, shared by stories, chat, dictation and videos. Tapping looks the
// word up (dictionary-first, so usually free); saving is an explicit second tap
// so the "Saved words" deck only holds words the learner actually chose.

/** Strip surrounding punctuation but keep letters, apostrophes and hyphens. */
export function cleanWord(raw: string): string {
  return raw.replace(/^[^\p{L}0-9'’-]+|[^\p{L}0-9'’-]+$/gu, '')
}

export interface WordLookupState {
  term: string
  status: 'loading' | 'done' | 'error'
  translation?: string
  partOfSpeech?: string | null
  gender?: string | null
  note?: string
  saveState: 'idle' | 'saving' | 'saved' | 'already' | 'error'
  source?: CardSource
}

export function useWordLookup() {
  const [lookup, setLookup] = useState<WordLookupState | null>(null)
  // Ignore responses for a word the learner has already tapped past.
  const seq = useRef(0)

  const open = useCallback(async (raw: string, source?: CardSource) => {
    const term = cleanWord(raw)
    if (!term) return
    const id = ++seq.current
    setLookup({ term, status: 'loading', saveState: 'idle', source })
    try {
      const res = await fetch('/api/words/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term }),
      })
      const data = await res.json()
      if (id !== seq.current) return
      setLookup(res.ok
        ? { term, status: 'done', translation: data.translation, partOfSpeech: data.partOfSpeech, gender: data.gender, saveState: 'idle', source }
        : { term, status: 'error', note: data.error || 'Could not translate', saveState: 'idle', source })
    } catch {
      if (id === seq.current) setLookup({ term, status: 'error', note: 'Network error', saveState: 'idle', source })
    }
  }, [])

  const save = useCallback(async () => {
    if (!lookup || lookup.saveState === 'saving' || lookup.saveState === 'saved') return
    const { term, source } = lookup
    setLookup((l) => (l ? { ...l, saveState: 'saving' } : l))
    try {
      const res = await fetch('/api/words/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, source }),
      })
      const data = await res.json()
      setLookup((l) => (l && l.term === term
        ? { ...l, saveState: res.ok ? (data.alreadySaved ? 'already' : 'saved') : 'error', note: res.ok ? l.note : data.error }
        : l))
    } catch {
      setLookup((l) => (l && l.term === term ? { ...l, saveState: 'error', note: 'Network error' } : l))
    }
  }, [lookup])

  const close = useCallback(() => { seq.current++; setLookup(null) }, [])

  return { lookup, open, save, close }
}

/** Render text with every word tappable. Whitespace and punctuation pass through. */
export function TappableText({
  text,
  onWord,
  activeTerm,
  wordClass,
}: {
  text: string
  onWord: (word: string) => void
  activeTerm?: string
  /** Extra classes per word, e.g. underlining words the learner doesn't know yet. */
  wordClass?: (word: string) => string | undefined
}) {
  return (
    <>
      {text.split(/(\s+)/).map((tok, i) => {
        const w = cleanWord(tok)
        if (/^\s+$/.test(tok) || !w) return <span key={i}>{tok}</span>
        const active = activeTerm && w.toLowerCase() === activeTerm.toLowerCase()
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onWord(tok) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onWord(tok) } }}
            className={`cursor-pointer decoration-dotted underline-offset-2 hover:text-accent hover:underline ${active ? 'text-accent underline' : ''} ${wordClass?.(tok) ?? ''}`}
          >
            {tok}
          </span>
        )
      })}
    </>
  )
}

/** The lookup result card. `floating` pins it above the bottom nav for reading surfaces. */
export function WordLookupCard({
  lookup,
  onSave,
  onClose,
  floating = false,
  extra,
}: {
  lookup: WordLookupState | null
  onSave: () => void
  onClose: () => void
  floating?: boolean
  /** More actions beside Save (e.g. "Save line" on video subtitles). */
  extra?: React.ReactNode
}) {
  const { speechTag, ttsVoice } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  if (!lookup) return null

  const saved = lookup.saveState === 'saved' || lookup.saveState === 'already'
  const wrap = floating
    ? 'fixed inset-x-4 bottom-24 md:bottom-6 z-40 max-w-md mx-auto shadow-(--shadow-lg)'
    : 'mt-2'

  return (
    <div className={`${wrap} flex items-center gap-3 border-2 border-line rounded-full bg-paper-raised px-3 py-2.5 text-sm`} role="status" aria-live="polite">
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5">
          <strong className="text-base">{lookup.term}</strong>
          {tts.supported && (
            <button onClick={() => tts.speak(lookup.term)} className="text-muted hover:text-accent" aria-label="Hear it">
              <Volume2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          )}
          {lookup.partOfSpeech && <span className="meta text-muted">{lookup.partOfSpeech}{lookup.gender ? ` · ${lookup.gender}` : ''}</span>}
        </p>
        {lookup.status === 'loading' && <p className="text-muted">Translating…</p>}
        {lookup.status === 'done' && <p className="text-ink-soft truncate">{lookup.translation}</p>}
        {lookup.status === 'error' && <p className="text-accent2">{lookup.note}</p>}
        {lookup.saveState === 'error' && lookup.status === 'done' && <p className="meta text-accent2">{lookup.note || 'Could not save'}</p>}
      </div>
      {lookup.status === 'done' && (
        <button
          onClick={onSave}
          disabled={saved || lookup.saveState === 'saving'}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold transition-colors ${
            saved ? 'border-ok text-ok' : 'border-line hover:bg-paper-dark'
          }`}
        >
          {lookup.saveState === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" strokeWidth={2.2} />}
          {lookup.saveState === 'already' ? 'In deck' : saved ? 'Saved' : 'Save'}
        </button>
      )}
      {lookup.status === 'done' && extra}
      <button onClick={onClose} className="shrink-0 text-muted hover:text-accent" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
