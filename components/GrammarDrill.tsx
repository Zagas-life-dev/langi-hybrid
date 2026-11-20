'use client'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2, Check, X, ArrowRight, RotateCcw, Dumbbell } from 'lucide-react'
import { useTTS, useReadAloud } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import ReadAloudBar from '@/components/ReadAloud'
import { normalizeAnswer } from '@/lib/srs-core'

interface Example { fr: string; en: string }
interface Drill { prompt: string; answer: string; hint?: string }

interface CompleteResult {
  score?: number
  newlyMetGoal?: boolean
  unlocked?: { id: string; title: string; icon: string }[]
}

export default function GrammarDrill({
  slug,
  title,
  examples,
  drills,
}: {
  slug: string
  title: string
  examples: Example[]
  drills: Drill[]
}) {
  const [phase, setPhase] = useState<'intro' | 'drill' | 'answered' | 'done'>('intro')
  const [pos, setPos] = useState(0)
  const [answer, setAnswer] = useState('')
  const [lastCorrect, setLastCorrect] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [missedCount, setMissedCount] = useState(0)
  const [result, setResult] = useState<CompleteResult | null>(null)
  const missed = useRef<Drill[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { speechTag, ttsVoice } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  // Examples are target-language sentences, so they're worth hearing as a
  // continuous set rather than one tap at a time.
  const exampleTexts = useMemo(() => examples.map((e) => e.fr), [examples])
  // 'conversational': these are model sentences, so they should sound like a
  // native speaker actually saying them, not a pronunciation drill.
  const exampleReader = useReadAloud(exampleTexts, speechTag, ttsVoice)

  const current = drills[pos]
  // Strip the parenthetical cue for the spoken sentence so TTS reads naturally.
  const speakable = (s: string) => s.replace(/_+/g, '…')

  function start() {
    setPhase('drill')
    setPos(0)
    setCorrectCount(0)
    missed.current = []
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function check() {
    if (!current) return
    const ok = normalizeAnswer(answer, 'lenient') === normalizeAnswer(current.answer, 'lenient')
    setLastCorrect(ok)
    if (ok) setCorrectCount((c) => c + 1)
    else missed.current.push(current)
    setPhase('answered')
  }

  async function next() {
    const nextPos = pos + 1
    setAnswer('')
    if (nextPos >= drills.length) {
      await finish()
    } else {
      setPos(nextPos)
      setPhase('drill')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  async function finish() {
    setMissedCount(missed.current.length)
    setPhase('done')
    try {
      const res = await fetch('/api/grammar/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          total: drills.length,
          correct: correctCount,
          missed: missed.current.map((d) => ({ prompt: d.prompt, answer: d.answer, hint: d.hint })),
        }),
      })
      setResult(await res.json().catch(() => ({})))
    } catch {
      setResult({})
    }
  }

  const score = drills.length ? Math.round((correctCount / drills.length) * 100) : 0

  // --- Intro: examples + start ---------------------------------------------
  if (phase === 'intro') {
    return (
      <div>
        {examples.length > 0 && (
          <div className="mb-8">
            <p className="meta text-muted mb-3">Examples</p>
            <ReadAloudBar controls={exampleReader} count={exampleTexts.length} label="Play all" className="mb-3" />
            <div className="space-y-2">
              {examples.map((e, i) => {
                const active = exampleReader.index === i
                return (
                  <div key={i} className={`border p-3 flex items-start justify-between gap-3 transition-colors ${
                    active ? 'border-accent bg-accent/10' : 'border-line/30'
                  }`}>
                    <div>
                      <p className="font-medium">{e.fr}</p>
                      <p className="text-sm text-muted">{e.en}</p>
                    </div>
                    {exampleReader.supported && (
                      <button onClick={() => exampleReader.jump(i)} className="circle-arrow w-8 h-8 shrink-0 hover:bg-paper-dark" aria-label={`Read from example ${i + 1}`}>
                        <Volume2 className="w-4 h-4" strokeWidth={2.2} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <button onClick={start} className="btn-ink w-full">
          <Dumbbell className="w-4 h-4" /> Start drills ({drills.length})
        </button>
      </div>
    )
  }

  // --- Done -----------------------------------------------------------------
  if (phase === 'done') {
    return (
      <div className="border-[2.5px] border-line rounded-[32px] p-8 text-center shadow-(--shadow-lg)">
        <p className="display font-display text-4xl mb-2">{score}%</p>
        <p className="text-muted mb-1">{correctCount} / {drills.length} correct</p>
        {result?.unlocked?.map((u) => (
          <p key={u.id} className="meta text-accent mt-2">{u.icon} {u.title} unlocked!</p>
        ))}
        {result?.newlyMetGoal && <p className="meta text-accent mt-1">Daily goal reached. Bravo !</p>}
        <p className="meta text-muted mt-3 mb-6">
          {missedCount > 0
            ? `${missedCount} added to your Mistakes deck to re-practise.`
            : 'Perfect — nothing to re-practise.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={start} className="btn-ghost"><RotateCcw className="w-4 h-4" /> Retry</button>
          {missedCount > 0 && <Link href="/learn/mistakes" className="btn-ghost">Practise mistakes</Link>}
          <Link href="/learn/grammar" className="btn-ink">Done</Link>
        </div>
      </div>
    )
  }

  // --- Drill (active / answered) -------------------------------------------
  return (
    <div>
      <p className="meta text-muted mb-2 flex items-center justify-between">
        <span>{title} · drills</span>
        <span>{pos + 1} / {drills.length}</span>
      </p>
      <div className="h-1.5 bg-ink/10 mb-6">
        <div className="h-full bg-accent transition-all" style={{ width: `${(pos / drills.length) * 100}%` }} />
      </div>

      <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 mb-5 shadow-(--shadow-lg)">
        <div className="flex items-start justify-between gap-3">
          <p className="display font-display text-2xl leading-snug">{current?.prompt}</p>
          {tts.supported && current && (
            <button onClick={() => tts.speak(speakable(current.prompt))} className="circle-arrow w-9 h-9 shrink-0 hover:bg-paper-dark" aria-label="Hear">
              <Volume2 className="w-4 h-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {phase === 'drill' ? (
        <form onSubmit={(e) => { e.preventDefault(); check() }}>
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Fill in the blank…"
            className="field-brut w-full mb-4"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="submit" className="btn-ink w-full">Check</button>
        </form>
      ) : (
        <div>
          <div className={`border p-5 mb-4 ${lastCorrect ? 'border-ok' : 'border-accent2'}`}>
            <div className={`flex items-center gap-2 font-medium mb-2 ${lastCorrect ? 'text-ok' : 'text-accent2'}`}>
              {lastCorrect ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              {lastCorrect ? 'Correct!' : 'Not quite'}
            </div>
            <p className="text-sm"><span className="text-muted">Answer: </span><span className="font-medium">{current?.answer}</span></p>
            {current?.hint && <p className="text-sm text-muted mt-2 italic">{current.hint}</p>}
          </div>
          <button onClick={next} className="btn-ink w-full">
            {pos + 1 >= drills.length ? 'Finish' : 'Next'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
