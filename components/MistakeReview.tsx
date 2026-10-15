'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Volume2, Check, X, RotateCcw, ArrowRight, AlertCircle } from 'lucide-react'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import { useOnline } from '@/lib/offlineQueue'
import { queueOutbox, loadOfflineMistakes } from '@/lib/offlineData'
import { QuizSkeleton } from '@/components/Skeleton'

const MAX_SESSION_REVIEWS = 3

interface MistakeItem {
  id: string
  source: 'sentence' | 'chat' | 'review' | 'grammar'
  prompt: string
  answer: string
  userAnswer: string
  note: string
  box: number
}

interface AnswerResult {
  newlyMetGoal?: boolean
  unlocked?: { id: string; title: string; icon: string }[]
}

const SOURCE_LABEL = (lang: string): Record<MistakeItem['source'], string> => ({
  sentence: `Translate into ${lang}`,
  chat: 'Fix your sentence',
  grammar: 'Complete correctly',
  review: 'Recall the answer',
})

export default function MistakeReview() {
  const [queue, setQueue] = useState<MistakeItem[]>([])
  const [pos, setPos] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'active' | 'revealed' | 'done' | 'empty'>('loading')
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 })
  const [submitting, setSubmitting] = useState(false)
  const [celebrations, setCelebrations] = useState<{ id: string; text: string }[]>([])
  const attempts = useRef<Record<string, number>>({})

  const current = queue[pos]
  const online = useOnline()
  const { speechTag, meta, ttsVoice } = useLang()
  const tts = useTTS(speechTag, ttsVoice)

  const load = useCallback(async () => {
    setPhase('loading')
    attempts.current = {}
    setStats({ reviewed: 0, correct: 0 })
    let items: MistakeItem[] = []
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const res = await fetch('/api/mistakes/due')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      items = data.items || []
    } catch {
      // Offline / unreachable — practise from the locally cached mistakes deck.
      items = (await loadOfflineMistakes()) as MistakeItem[]
    }
    setQueue(items)
    setPos(0)
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

  async function gradeSelf(correct: boolean) {
    if (!current || submitting) return
    setSubmitting(true)
    const payload = { mistakeId: current.id, correct }
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
      const res = await fetch('/api/mistakes/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AnswerResult = await res.json().catch(() => ({}))
      celebrate(data)
    } catch {
      // Offline — queue the self-grade; it's applied server-side on reconnect.
      await queueOutbox('/api/mistakes/answer', payload).catch(() => {})
    }
    setSubmitting(false)
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }))
    attempts.current[current.id] = (attempts.current[current.id] || 0) + 1

    // Re-queue a missed item within the session (up to a cap).
    const newQueue = [...queue]
    if (!correct && (attempts.current[current.id] || 0) < MAX_SESSION_REVIEWS) {
      newQueue.push({ ...current })
    }
    const nextPos = pos + 1
    setQueue(newQueue)
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
        <Link href="/learn" className="meta text-muted hover:text-accent">← Dashboard</Link>
        <span className="meta text-muted flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-accent2" /> Mistakes</span>
      </div>
      <h1 className="display font-display text-3xl mb-6">Mistakes deck</h1>

      {!online && (
        <div className="border-2 border-line rounded-full bg-warn/15 px-4 py-2 mb-6 text-sm flex items-center gap-2">
          Offline. practising from your cached deck; grades sync when you reconnect.
        </div>
      )}

      {phase === 'loading' && <QuizSkeleton label="Loading your mistakes" />}

      {phase === 'empty' && (
        <div className="border-[2.5px] border-line rounded-[24px] p-10 text-center">
          <p className="display font-display text-3xl mb-3">Nothing to fix. Bravo !</p>
          <p className="text-muted mb-6">No mistakes are due. They appear here automatically when you slip up in sentences or chat.</p>
          <Link href="/learn" className="btn-ink">Back to dashboard</Link>
        </div>
      )}

      {phase === 'done' && (
        <div className="border-[2.5px] border-line rounded-[32px] p-10 text-center shadow-(--shadow-lg)">
          <p className="display font-display text-4xl mb-3">Session complete</p>
          <p className="text-muted mb-2">{stats.correct} / {stats.reviewed} recalled</p>
          <p className="meta text-muted mb-8">Items you missed will come back sooner.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={load} className="btn-ghost"><RotateCcw className="w-4 h-4" /> Again</button>
            <Link href="/learn" className="btn-ink">Done</Link>
          </div>
        </div>
      )}

      {(phase === 'active' || phase === 'revealed') && current && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="meta text-muted">{remaining} left</span>
            <span className="meta text-muted uppercase">{current.source} · box {current.box}</span>
          </div>

          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-8 mb-5 shadow-(--shadow-lg)">
            <p className="meta text-muted mb-2">{SOURCE_LABEL(meta.name)[current.source]}</p>
            <p className="display font-display text-2xl leading-snug">{current.prompt}</p>
          </div>

          {phase === 'active' ? (
            <button onClick={() => setPhase('revealed')} className="btn-ink w-full">Reveal answer</button>
          ) : (
            <div>
              <div className="border border-ok p-5 mb-4">
                <p className="meta text-muted mb-1">Correct</p>
                <p className="text-lg font-medium flex items-center gap-2">
                  {current.answer}
                  {tts.supported && (
                    <button onClick={() => tts.speak(current.answer)} className="text-muted hover:text-accent" aria-label="Hear">
                      <Volume2 className="w-4 h-4" strokeWidth={2.2} />
                    </button>
                  )}
                </p>
                {current.userAnswer && current.userAnswer !== current.prompt && (
                  <p className="text-sm text-muted mt-2">You wrote: <span className="line-through">{current.userAnswer}</span></p>
                )}
                {current.note && <p className="text-sm mt-3 pt-3 border-t border-line/10 italic">{current.note}</p>}
              </div>
              <p className="meta text-muted text-center mb-3">Did you recall it correctly?</p>
              <div className="flex gap-3">
                <button onClick={() => gradeSelf(false)} disabled={submitting} className="btn-ghost flex-1 justify-center border-accent2 text-accent2">
                  <X className="w-4 h-4" /> Practise again
                </button>
                <button onClick={() => gradeSelf(true)} disabled={submitting} className="btn-ink flex-1 justify-center">
                  <Check className="w-4 h-4" /> Got it <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
