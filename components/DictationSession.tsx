'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, RotateCcw, Play } from 'lucide-react'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import { scorePronunciation, type PronunciationResult, type WordStatus } from '@/lib/pronunciation'
import { useOnline } from '@/lib/offlineQueue'
import { saveDictationLines, loadDictationLines } from '@/lib/offlineData'
import { useWordLookup, WordLookupCard } from '@/components/WordLookup'
import { generateDictationLines, getLearnerContext } from '@/lib/hybrid/generate'

interface Line { text: string; translation: string }

const WORD_CLASS: Record<WordStatus, string> = {
  correct: 'text-ok',
  close: 'text-warn',
  wrong: 'text-accent2 underline decoration-wavy decoration-accent2/60 underline-offset-4',
}

export default function DictationSession() {
  const { speechTag, ttsVoice, meta, learningLang, nativeLang } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  const online = useOnline()
  const [lines, setLines] = useState<Line[]>([])
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'active' | 'answered' | 'done'>('loading')
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState<PronunciationResult | null>(null)
  const wordLookup = useWordLookup()
  const [scores, setScores] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = lines[pos]

  const load = useCallback(async () => {
    setPhase('loading'); setError(null); setScores([]); setPos(0)
    try {
      // The sentences are written in the browser through Firebase AI Logic (on-device when it can,
      // so a fresh set works offline too). If that fails, replay the last saved set.
      const ctx = await getLearnerContext(learningLang)
      const lines: Line[] = await generateDictationLines({ level: ctx.level, lang: ctx.lang, nativeLang })
      if (!lines.length) throw new Error('Could not generate dictation')
      setLines(lines)
      saveDictationLines(lines).catch(() => {}) // cache for offline replay
      setTyped(''); setResult(null)
      setPhase(lines.length ? 'active' : 'done')
    } catch {
      const cached = await loadDictationLines()
      if (cached.length) {
        setLines(cached as Line[])
        setTyped(''); setResult(null)
        setPhase('active')
      } else {
        setError('Could not make a dictation set right now. Check that on-device AI is on (or reconnect), then try again.')
      }
    }
  }, [learningLang, nativeLang])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Auto-play each new sentence once it's ready, and focus the box.
  useEffect(() => {
    if (phase === 'active' && current && tts.supported) tts.speak(current.text)
    if (phase === 'active') inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pos])

  function check() {
    if (!current) return
    const r = scorePronunciation(current.text, typed)
    setResult(r)
    setScores((s) => [...s, r.score])
    setPhase('answered')
  }

  function next() {
    const np = pos + 1
    setTyped(''); setResult(null)
    if (np >= lines.length) setPhase('done')
    else { setPos(np); setPhase('active') }
  }

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/learn" className="meta text-muted hover:text-accent">← Dashboard</Link>
      <p className="meta text-muted mb-2 mt-4">Listening · {meta.name}</p>
      <h1 className="display font-display text-5xl mb-3">Dictation</h1>
      <p className="text-muted mb-8">Listen and type what you hear. We&apos;ll highlight every word you got right.</p>

      {!online && (
        <div className="border-2 border-line rounded-full bg-warn/15 px-4 py-2 mb-6 text-sm flex items-center gap-2">
          Offline. replaying your last downloaded dictation set (new sentences need a connection).
        </div>
      )}

      {phase === 'loading' && !error && <p className="text-muted text-center py-16">Preparing your sentences…</p>}
      {error && (
        <div className="border-[2.5px] border-line rounded-[24px] p-6 text-center">
          <p className="text-accent2 mb-4">{error}</p>
          <button onClick={load} className="btn-ink">Try again</button>
        </div>
      )}

      {!tts.supported && phase !== 'loading' && (
        <p className="meta text-muted mb-4">Dictation needs audio. Try Chrome or Edge.</p>
      )}

      {(phase === 'active' || phase === 'answered') && current && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="meta text-muted">{pos + 1} / {lines.length}</span>
            {scores.length > 0 && <span className="meta text-muted">avg {avg}/100</span>}
          </div>

          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-8 mb-5 text-center shadow-(--shadow-lg)">
            <button
              onClick={() => tts.speak(current.text)}
              className="circle-arrow w-16 h-16 mx-auto hover:bg-paper-dark"
              aria-label="Play sentence"
            >
              <Play className="w-6 h-6" strokeWidth={2.2} />
            </button>
            <p className="meta text-muted mt-3">Tap to replay</p>
          </div>

          {phase === 'active' && (
            <form onSubmit={(e) => { e.preventDefault(); check() }}>
              <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)}
                placeholder="Type what you hear…" className="field-brut w-full mb-4"
                autoComplete="off" autoCapitalize="off" spellCheck={false} />
              <div className="flex gap-3">
                <button type="submit" disabled={!typed.trim()} className="btn-ink flex-1">Check</button>
                <button type="button" onClick={check} className="btn-ghost">Reveal</button>
              </div>
            </form>
          )}

          {phase === 'answered' && result && (
            <div>
              <div className="border-[2.5px] border-line rounded-[24px] p-5 mb-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="meta text-muted">{result.verdict === 'great' ? 'Oui ! Spot on' : result.verdict === 'good' ? 'Presque !' : 'Keep practising'}</span>
                  <span className="display font-display text-3xl">{result.score}<span className="text-sm text-muted">/100</span></span>
                </div>
                <p className="leading-relaxed text-lg mb-3">
                  {result.words.map((w, i) => (
                    <span key={i}>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => wordLookup.open(w.text, { kind: 'dictation', context: current.text })}
                        onKeyDown={(e) => { if (e.key === 'Enter') wordLookup.open(w.text, { kind: 'dictation', context: current.text }) }}
                        className={`${WORD_CLASS[w.status]} cursor-pointer hover:underline decoration-dotted`}
                      >{w.text}</span>{i < result.words.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </p>
                <p className="text-sm text-muted pt-3 border-t border-line/10">{current.translation}</p>
                {online && <p className="meta text-muted mt-2">Tap a word to look it up and save it.</p>}
                <WordLookupCard lookup={wordLookup.lookup} onSave={wordLookup.save} onClose={wordLookup.close} onExplain={wordLookup.explain} />
              </div>
              <button onClick={() => { wordLookup.close(); next() }} className="btn-ink w-full">{pos + 1 >= lines.length ? 'Finish' : 'Next'} <ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && !error && (
        <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
          <p className="display font-display text-4xl mb-3">Dictation complete</p>
          {scores.length > 0 && <p className="text-muted mb-2">Average score {avg}/100</p>}
          <p className="meta text-muted mb-8">Listening is a muscle — a little every day goes a long way.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={load} className="btn-ink"><RotateCcw className="w-4 h-4" /> New set</button>
            <Link href="/learn" className="btn-ghost">Done</Link>
          </div>
        </div>
      )}
    </div>
  )
}
