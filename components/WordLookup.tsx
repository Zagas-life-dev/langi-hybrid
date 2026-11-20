'use client'
import { useCallback, useRef, useState } from 'react'
import { BookmarkPlus, Check, Languages, Volume2, X, Loader2 } from 'lucide-react'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import type { CardSource } from '@/lib/models/Card'
import { postWithWordAi } from '@/lib/hybrid/words'
import { translateInContext, type ContextTranslation } from '@/lib/hybrid/tutor'
import HybridBadge from '@/components/HybridBadge'

// Tap-a-word, shared by stories, chat, dictation and videos. Tapping looks the
// word up (dictionary-first, so usually free); saving is an explicit second tap
// so the "Saved words" deck only holds words the learner actually chose.

/** Strip surrounding punctuation but keep letters, apostrophes and hyphens. */
export function cleanWord(raw: string): string {
  return raw.replace(/^[^\p{L}0-9'’-]+|[^\p{L}0-9'’-]+$/gu, '')
}

export interface WordLookupState {
  term: string
  /** 'sentence' = the learner tapped a whole line: no dictionary entry, no Save, just Explain. */
  kind?: 'word' | 'sentence'
  status: 'loading' | 'done' | 'error'
  translation?: string
  partOfSpeech?: string | null
  gender?: string | null
  note?: string
  saveState: 'idle' | 'saving' | 'saved' | 'already' | 'error'
  source?: CardSource
  /** Full sentence the word sat in (when the surface knows it). */
  sentence?: string
  /** Nuanced, context-aware translation, fetched on demand. */
  ctx?: { status: 'loading' | 'done' | 'error'; data?: ContextTranslation }
}

export function useWordLookup() {
  const { learningLang, nativeLang } = useLang()
  const [lookup, setLookup] = useState<WordLookupState | null>(null)
  // Ignore responses for a word the learner has already tapped past.
  const seq = useRef(0)

  const open = useCallback(async (raw: string, source?: CardSource) => {
    const term = cleanWord(raw)
    if (!term) return
    const id = ++seq.current
    const sentence = source?.context?.trim() || undefined
    setLookup({ term, status: 'loading', saveState: 'idle', source, sentence })
    try {
      // Dictionary first; on a miss the browser translates it (Firebase AI Logic) and retries.
      const { res, data } = await postWithWordAi('/api/words/lookup', { term }, { lang: learningLang, nativeLang })
      if (id !== seq.current) return
      setLookup(res.ok
        ? { term, status: 'done', translation: data.translation as string, partOfSpeech: data.partOfSpeech as string | null, gender: data.gender as string | null, saveState: 'idle', source, sentence }
        : { term, status: 'error', note: (data.error as string) || 'Could not translate', saveState: 'idle', source, sentence })
    } catch {
      if (id === seq.current) setLookup({ term, status: 'error', note: 'Network error', saveState: 'idle', source, sentence })
    }
  }, [learningLang, nativeLang])

  /** Translate the selection AND its whole sentence, using the surrounding context. */
  const explain = useCallback(async () => {
    if (!lookup?.sentence || lookup.ctx?.status === 'loading') return
    const { term, sentence } = lookup
    const id = seq.current
    setLookup((l) => (l ? { ...l, ctx: { status: 'loading' } } : l))
    let data: ContextTranslation | null = null
    try { data = await translateInContext(term, sentence!, learningLang, nativeLang) } catch { /* shown as error below */ }
    if (id !== seq.current) return
    setLookup((l) => (l && l.term === term
      ? { ...l, ctx: data ? { status: 'done', data } : { status: 'error' } }
      : l))
  }, [lookup, learningLang, nativeLang])

  /** Tap to Explain for a whole sentence or message. */
  const explainSentence = useCallback(async (raw: string, source?: CardSource) => {
    const text = raw.trim()
    if (!text) return
    const id = ++seq.current
    setLookup({ term: text, kind: 'sentence', status: 'done', saveState: 'idle', source, sentence: text, ctx: { status: 'loading' } })
    let data: ContextTranslation | null = null
    try { data = await translateInContext(text, text, learningLang, nativeLang) } catch { /* shown as error below */ }
    if (id !== seq.current) return
    setLookup((l) => (l && l.term === text ? { ...l, ctx: data ? { status: 'done', data } : { status: 'error' } } : l))
  }, [learningLang, nativeLang])

  const save = useCallback(async () => {
    if (!lookup || lookup.saveState === 'saving' || lookup.saveState === 'saved') return
    const { term, source } = lookup
    setLookup((l) => (l ? { ...l, saveState: 'saving' } : l))
    try {
      const { res, data } = await postWithWordAi('/api/words/save', { term, source }, { lang: learningLang, nativeLang })
      setLookup((l) => (l && l.term === term
        ? { ...l, saveState: res.ok ? (data.alreadySaved ? 'already' : 'saved') : 'error', note: res.ok ? l.note : (data.error as string) }
        : l))
    } catch {
      setLookup((l) => (l && l.term === term ? { ...l, saveState: 'error', note: 'Network error' } : l))
    }
  }, [lookup, learningLang, nativeLang])

  const close = useCallback(() => { seq.current++; setLookup(null) }, [])

  return { lookup, open, save, close, explain, explainSentence }
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
  onExplain,
  floating = false,
  extra,
}: {
  lookup: WordLookupState | null
  onSave: () => void
  onClose: () => void
  /** Fetch the context-aware sentence translation. Button shows only when the sentence is known. */
  onExplain?: () => void
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

  const isSentence = lookup.kind === 'sentence'
  const canExplain = !!onExplain && lookup.status === 'done' && !!lookup.sentence
  const ctx = lookup.ctx

  return (
    <div className={`${wrap} border-2 border-line bg-paper-raised text-sm ${ctx ? 'rounded-2xl' : 'rounded-full'}`} role="status" aria-live="polite">
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5">
          <strong className={`text-base ${isSentence ? 'truncate' : ''}`}>{lookup.term}</strong>
          {tts.supported && (
            <button onClick={() => tts.speak(lookup.term)} className="text-muted hover:text-accent" aria-label="Hear it">
              <Volume2 className="w-3.5 h-3.5" strokeWidth={2.2} />
            </button>
          )}
          {lookup.partOfSpeech && <span className="meta text-muted">{lookup.partOfSpeech}{lookup.gender ? ` · ${lookup.gender}` : ''}</span>}
        </p>
        {lookup.status === 'loading' && <p className="text-muted">Translating…</p>}
        {lookup.status === 'done' && !isSentence && <p className="text-ink-soft truncate">{lookup.translation}</p>}
        {lookup.status === 'error' && <p className="text-accent2">{lookup.note}</p>}
        {lookup.saveState === 'error' && lookup.status === 'done' && <p className="meta text-accent2">{lookup.note || 'Could not save'}</p>}
      </div>
      {lookup.status === 'done' && !isSentence && (
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
      {canExplain && !ctx && (
        <button onClick={onExplain} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-line text-xs font-bold hover:bg-paper-dark">
          <Languages className="w-3.5 h-3.5" strokeWidth={2.2} />
          In context
        </button>
      )}
      {lookup.status === 'done' && extra}
      <button onClick={onClose} className="shrink-0 text-muted hover:text-accent" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
    {ctx && (
      <div className="border-t border-line px-4 py-3 space-y-2 max-h-[45vh] overflow-y-auto">
        {ctx.status === 'loading' && <p className="text-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Reading the whole sentence…</p>}
        {ctx.status === 'error' && (
          <p className="text-accent2">
            Couldn’t translate in context. <button onClick={onExplain} className="underline font-bold">Try again</button>
          </p>
        )}
        {ctx.status === 'done' && ctx.data && (
          <>
            {ctx.data.badge && <HybridBadge {...ctx.data.badge} />}
            {ctx.data.meaning && !isSentence && <p><span className="meta text-muted">Here, “{lookup.term}” means</span><br /><strong>{ctx.data.meaning}</strong></p>}
            {ctx.data.sentence && <p><span className="meta text-muted">Whole sentence</span><br />{ctx.data.sentence}</p>}
            {ctx.data.literal && <p><span className="meta text-muted">Word for word</span><br /><span className="text-ink-soft italic">{ctx.data.literal}</span></p>}
            {ctx.data.nuance && <p><span className="meta text-muted">Nuance</span><br />{ctx.data.nuance}</p>}
            {ctx.data.grammar && <p><span className="meta text-muted">Grammar</span><br />{ctx.data.grammar}</p>}
            {ctx.data.alternatives.length > 0 && (
              <div>
                <span className="meta text-muted">Other ways to say it</span>
                <ul className="list-disc pl-5">{ctx.data.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </div>
    )}
    </div>
  )
}
