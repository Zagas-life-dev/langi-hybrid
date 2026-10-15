'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, X, ArrowRight, RotateCcw, BookOpen, Volume2 } from 'lucide-react'
import { useOnline } from '@/lib/offlineQueue'
import { loadOfflineGrammar, queueOutbox } from '@/lib/offlineData'
import { QuizSkeleton } from '@/components/Skeleton'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'

const MAX_SESSION_REVIEWS = 3

interface Item {
  id: string
  level: string
  concept: string
  prompt: string
  options: string[]
  box: number
  isNew: boolean
  // Present only when loaded from the offline cache — enables on-device grading.
  answerIndex?: number
  explanation?: string
}

interface AnswerResult {
  correct: boolean
  answerIndex: number
  explanation: string
  newBox: number
  newlyMetGoal?: boolean
  unlocked?: { id: string; title: string; icon: string }[]
}

export default function GrammarPractice() {
  const [queue, setQueue] = useState<Item[]>([])
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'active' | 'answered' | 'done' | 'empty'>('loading')
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 })
  const [submitting, setSubmitting] = useState(false)
  const [celebrations, setCelebrations] = useState<{ id: string; text: string }[]>([])
  const attempts = useRef<Record<string, number>>({})

  const current = queue[pos]
  const online = useOnline()
  const { speechTag, ttsVoice } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  // Concept questions carry blanks as underscores; read them as a pause so the
  // voice doesn't spell out "underscore underscore underscore".
  const speakable = (s: string) => s.replace(/_+/g, '…')

  const load = useCallback(async () => {
    setPhase('loading')
    attempts.current = {}
    setStats({ reviewed: 0, correct: 0 })
    let items: Item[] = []
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const res = await fetch('/api/grammar/practice/due')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      items = data.items || []
    } catch {
      // Offline — practise from the cached grammar questions (they carry answers).
      items = (await loadOfflineGrammar()) as Item[]
    }
    setQueue(items)
    setPos(0)
    setChosen(null)
    setResult(null)
    setPhase(items.length ? 'active' : 'empty')
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  function celebrate(data: AnswerResult) {
    const toasts: { id: string; text: string }[] = []
    if (data.newlyMetGoal) toasts.push({ id: 'goal', text: 'Daily goal reached. Bravo !' })
    for (const a of data.unlocked || []) toasts.push({ id: `ach-${a.id}`, text: `${a.icon} ${a.title} unlocked!` })
    if (toasts.length === 0) return
    setCelebrations((prev) => [...prev, ...toasts])
    toasts.forEach((t) => setTimeout(() => setCelebrations((prev) => prev.filter((x) => x.id !== t.id)), 4000))
  }

  async function answer(choice: number) {
    if (!current || submitting || phase === 'answered') return
    setChosen(choice)
    setSubmitting(true)
    const payload = { questionId: current.id, choice }
    let correctVal = false
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const res = await fetch('/api/grammar/practice/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AnswerResult = await res.json()
      correctVal = data.correct
      setResult(data)
      celebrate(data)
    } catch {
      // Offline — grade on-device against the cached answer, queue for sync.
      correctVal = choice === current.answerIndex
      setResult({
        correct: correctVal,
        answerIndex: current.answerIndex ?? -1,
        explanation: current.explanation ?? '',
        newBox: current.box,
      })
      await queueOutbox('/api/grammar/practice/answer', payload).catch(() => {})
    }
    setPhase('answered')
    setSubmitting(false)
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correctVal ? 1 : 0) }))
    attempts.current[current.id] = (attempts.current[current.id] || 0) + 1
  }

  function next() {
    const wasWrong = result && !result.correct
    const newQueue = [...queue]
    if (wasWrong && current && (attempts.current[current.id] || 0) < MAX_SESSION_REVIEWS) {
      newQueue.push({ ...current })
    }
    const nextPos = pos + 1
    setQueue(newQueue)
    setChosen(null)
    setResult(null)
    if (nextPos >= newQueue.length) setPhase('done')
    else { setPos(nextPos); setPhase('active') }
  }

  const remaining = Math.max(0, queue.length - pos)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {celebrations.length > 0 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
          {celebrations.map((c) => (
            <div key={c.id} className="bg-purple text-on-purple px-5 py-2.5 shadow-[4px_4px_0_var(--accent)] font-medium text-sm whitespace-nowrap">
              {c.text}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <Link href="/learn/grammar" className="meta text-muted hover:text-accent">← Grammar</Link>
        <span className="meta text-muted flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-accent" /> Concept practice</span>
      </div>
      <h1 className="display font-display text-3xl mb-6">Grammar practice</h1>

      {!online && (
        <div className="border-2 border-line rounded-full bg-warn/15 px-4 py-2 mb-6 text-sm flex items-center gap-2">
          Offline. practising from cached questions; answers sync when you reconnect.
        </div>
      )}

      {phase === 'loading' && <QuizSkeleton label="Loading questions" />}

      {phase === 'empty' && (
        <div className="border-[2.5px] border-line rounded-[24px] p-10 text-center">
          <p className="display font-display text-3xl mb-3">All caught up. Bravo !</p>
          <p className="text-muted mb-6">No grammar concepts are due right now. Take a lesson to cover new ground, then they&apos;ll appear here.</p>
          <Link href="/learn/grammar" className="btn-ink">Browse lessons</Link>
        </div>
      )}

      {phase === 'done' && (
        <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
          <p className="display font-display text-4xl mb-3">Session complete</p>
          <p className="text-muted mb-2">{stats.correct} / {stats.reviewed} correct</p>
          <p className="meta text-muted mb-8">Concepts you missed will come back sooner and are in your Mistakes deck.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={load} className="btn-ghost"><RotateCcw className="w-4 h-4" /> Again</button>
            <Link href="/learn" className="btn-ink">Done</Link>
          </div>
        </div>
      )}

      {(phase === 'active' || phase === 'answered') && current && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="meta text-muted">{remaining} left</span>
            <span className="meta text-muted uppercase">{current.level}{current.isNew ? ' · NEW' : ` · box ${current.box}`}</span>
          </div>

          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 sm:p-8 mb-5 shadow-(--shadow-lg)">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xl font-medium leading-relaxed">{current.prompt}</p>
              {tts.supported && (
                <button
                  onClick={() => tts.speak(speakable(current.prompt))}
                  className="circle-arrow w-9 h-9 shrink-0 hover:bg-paper-dark"
                  aria-label="Hear the question"
                >
                  <Volume2 className="w-4 h-4" strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {current.options.map((opt, i) => {
              const isAnswer = result && i === result.answerIndex
              const isChosenWrong = result && i === chosen && !result.correct
              const cls = phase === 'answered'
                ? isAnswer
                  ? 'border-ok bg-ok/5'
                  : isChosenWrong
                    ? 'border-accent2 bg-accent2/5'
                    : 'opacity-60'
                : chosen === i ? 'border-accent' : ''
              return (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={phase === 'answered' || submitting}
                  className={`brut-card w-full text-left p-4 flex items-center gap-3 ${cls}`}
                >
                  <span className="meta text-muted">{i + 1}</span>
                  <span className="flex-1">{opt}</span>
                  {isAnswer && <Check className="w-4 h-4 text-ok shrink-0" />}
                  {isChosenWrong && <X className="w-4 h-4 text-accent2 shrink-0" />}
                </button>
              )
            })}
          </div>

          {phase === 'answered' && result && (
            <div className="mt-5">
              {result.explanation && (
                <p className="text-sm border-[2.5px] border-line/20 rounded-[24px] p-4 mb-4 italic">{result.explanation}</p>
              )}
              <button onClick={next} className="btn-ink w-full">Next <ArrowRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
