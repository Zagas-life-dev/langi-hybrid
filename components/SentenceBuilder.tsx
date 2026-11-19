'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, Mic, ArrowRight, RefreshCw } from 'lucide-react'
import { useTTS, useSTT } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import PronunciationCheck from '@/components/PronunciationCheck'
import { generateSentencePrompt, gradeSentence } from '@/lib/hybrid/tutor'
import { LiveCorrectPanel, useLiveCorrect } from '@/components/LiveCorrect'

interface PracticeCtx { level: string; lang: string; focus: string[] }

// Level and weak spots are cached so practice still works with no connection.
const CTX_KEY = 'langi.sentenceCtx'
const RECENT_KEY = 'langi.sentenceRecent'
function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode: fine */ }
}

interface Grade { score: number; feedback: string; correction: string }

export default function SentenceBuilder() {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [sentence, setSentence] = useState('')
  const [grade, setGrade] = useState<Grade | null>(null)
  const [phase, setPhase] = useState<'loading' | 'writing' | 'grading' | 'graded'>('loading')
  const [error, setError] = useState<string | null>(null)
  const ctxRef = useRef<PracticeCtx | null>(null)
  const [level, setLevel] = useState('A2')

  const { speechTag, meta, ttsVoice, learningLang } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  const stt = useSTT(speechTag, (t) => setSentence((prev) => (prev ? prev + ' ' + t : t)))
  // Live Correct: on-device feedback while writing the translation.
  const live = useLiveCorrect(sentence, learningLang, phase === 'writing')

  const loadPrompt = useCallback(async () => {
    setPhase('loading'); setError(null); setGrade(null); setSentence('')
    try {
      // Level + weak spots come from the server; the sentence is written in the browser
      // through Firebase AI Logic (on-device when it can).
      let ctx: PracticeCtx | null = null
      try {
        const res = await fetch('/api/sentences/prompt')
        const body = await res.json()
        if (!res.ok) { setError(body.error || 'Could not load a prompt'); setPhase('writing'); return }
        ctx = body as PracticeCtx
        writeJson(CTX_KEY, ctx)
      } catch {
        // Offline: use the last known level and weak spots.
        ctx = readJson<PracticeCtx | null>(CTX_KEY, null) ?? { level: 'A2', lang: learningLang, focus: [] }
      }
      ctxRef.current = ctx
      setLevel(ctx.level)
      const recent = readJson<string[]>(RECENT_KEY, [])
      const p = await generateSentencePrompt(ctx.level, ctx.lang, ctx.focus, recent)
      if (!p) { setError('Could not generate a prompt.'); setPhase('writing'); return }
      writeJson(RECENT_KEY, [p, ...recent].slice(0, 8))
      setPrompt(p)
      setPhase('writing')
    } catch (e) { setError((e as Error).message || 'Could not load a prompt'); setPhase('writing') }
  }, [learningLang])

  // Fetch a prompt on mount (setState resolves after the fetch).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadPrompt() }, [loadPrompt])

  async function submit() {
    if (!prompt || !sentence.trim()) return
    setPhase('grading'); setError(null)
    try {
      const ctx = ctxRef.current
      if (!ctx) { setError('Reload the prompt first'); setPhase('writing'); return }
      // Graded in the browser (Firebase AI Logic "grade" task: on-device first, works offline).
      const g = await gradeSentence(prompt, sentence.trim(), ctx.level, ctx.lang)
      // The grade is already on screen-ready; saving the attempt is best-effort so it works offline.
      try {
        const res = await fetch('/api/sentences/grade', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, sentence: sentence.trim(), grade: g }),
        })
        if (!res.ok) console.warn('[sentences] attempt not saved', res.status)
      } catch { console.warn('[sentences] offline: attempt not saved') }
      setGrade(g)
      setPhase('graded')
      if (g.correction && tts.supported) tts.speak(g.correction)
    } catch (e) { setError((e as Error).message || 'AI unavailable'); setPhase('writing') }
  }

  const scoreColor = (s: number) => (s >= 80 ? 'text-ok' : s >= 50 ? 'text-warn' : 'text-accent2')

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <p className="meta text-muted mb-2">Sentence practice</p>
      <h1 className="display font-display text-5xl mb-8">Build a sentence</h1>

      {phase === 'loading' ? (
        <p className="text-muted text-center py-16">Thinking of a sentence…</p>
      ) : (
        <>
          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 mb-5 shadow-(--shadow-lg)">
            <p className="meta text-muted mb-2">Translate into {meta.name}</p>
            <p className="text-2xl leading-relaxed">{prompt}</p>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <input value={sentence} onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && phase === 'writing') submit() }}
              placeholder={`Write your ${meta.name} translation…`} className="field-brut flex-1"
              autoComplete="off" disabled={phase === 'grading'} />
            {stt.supported && (
              <button type="button" onClick={() => (stt.listening ? stt.stop() : stt.start())}
                className={`circle-arrow w-11 h-11 shrink-0 ${stt.listening ? 'bg-accent text-on-accent border-accent' : 'hover:bg-paper-dark'}`} aria-label="Speak">
                <Mic className="w-4 h-4" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {phase === 'writing' && (
            <div className="mb-4"><LiveCorrectPanel text={sentence} state={live} lang={learningLang} level={level} onApply={setSentence} /></div>
          )}

          {phase !== 'graded' && (
            <button onClick={submit} disabled={phase === 'grading' || !sentence.trim()} className="btn-ink w-full">
              {phase === 'grading' ? 'Checking…' : 'Check my sentence'}
            </button>
          )}
          {!stt.supported && <p className="meta text-muted mt-3 text-center">Voice input needs Chrome or Edge. You can still type.</p>}
          {error && <p className="meta text-accent2 mt-3">{error}</p>}

          {phase === 'graded' && grade && (
            <div className="mt-6">
              <div className="border-[2.5px] border-line rounded-[24px] p-5 mb-4">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="meta text-muted">Score</span>
                  <span className={`display font-display text-4xl ${scoreColor(grade.score)}`}>{grade.score}<span className="text-lg text-muted">/100</span></span>
                </div>
                {grade.feedback && <p className="text-sm leading-relaxed mb-3">{grade.feedback}</p>}
                {grade.correction && (
                  <div className="pt-3 border-t border-line/10">
                    <p className="meta text-muted mb-1">Model answer</p>
                    <p className="flex items-center gap-2">
                      <span className="font-medium">{grade.correction}</span>
                      {tts.supported && (
                        <button onClick={() => tts.speak(grade.correction)} className="text-muted hover:text-accent" aria-label="Hear">
                          <Volume2 className="w-4 h-4" strokeWidth={2.2} />
                        </button>
                      )}
                    </p>
                  </div>
                )}
              </div>
              {grade.correction && (
                <div className="mb-4">
                  <PronunciationCheck target={grade.correction} label="Practise saying it" />
                </div>
              )}
              <button onClick={loadPrompt} className="btn-ink w-full">Next sentence <ArrowRight className="w-4 h-4" /></button>
            </div>
          )}

          {phase === 'writing' && (
            <button onClick={loadPrompt} className="meta text-muted hover:text-accent flex items-center gap-1.5 mt-5 mx-auto">
              <RefreshCw className="w-4 h-4" /> Different sentence
            </button>
          )}
        </>
      )}
    </div>
  )
}
