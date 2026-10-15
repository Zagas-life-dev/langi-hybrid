'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import Mascot from '@/components/Mascot'

interface Q {
  id: string
  level: string
  kind: string
  prompt: string
  options: string[]
}

interface Result {
  level: string
  levelBySkill: Record<string, string>
  scoreByLevel: Record<string, { correct: number; total: number }>
}

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const SKILL_LABEL: Record<string, string> = { grammar: 'Grammar', vocab: 'Vocabulary', reading: 'Reading' }

export default function PlacementTest({ currentLevel }: { currentLevel?: string | null }) {
  const router = useRouter()
  const [questions, setQuestions] = useState<Q[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [phase, setPhase] = useState<'intro' | 'loading' | 'active' | 'submitting' | 'done'>('intro')
  const [result, setResult] = useState<Result | null>(null)

  const start = useCallback(async () => {
    setPhase('loading')
    const res = await fetch('/api/placement/form')
    const data = await res.json()
    setQuestions(data.questions || [])
    setIdx(0)
    setAnswers({})
    setPhase('active')
  }, [])

  async function submit(finalAnswers: Record<string, number>) {
    setPhase('submitting')
    const res = await fetch('/api/placement/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: Object.entries(finalAnswers).map(([id, choice]) => ({ id, choice })) }),
    })
    const data: Result = await res.json()
    setResult(data)
    setPhase('done')
    router.refresh() // refresh nav so the new level shows
  }

  function choose(choice: number) {
    const q = questions[idx]
    const updated = { ...answers, [q.id]: choice }
    setAnswers(updated)
    if (idx + 1 >= questions.length) submit(updated)
    else setIdx(idx + 1)
  }

  useEffect(() => {
    // allow keyboard 1-4 to answer
    if (phase !== 'active') return
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10)
      const q = questions[idx]
      if (q && n >= 1 && n <= q.options.length) choose(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (phase === 'intro') {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <span className="sticker sticker-lime mb-4">About 3 minutes</span>
        <h1 className="display text-5xl sm:text-6xl tracking-[-0.045em] mb-8">Find your level</h1>
        <div className="relative fill-card bg-yellow rounded-[40px] shadow-(--shadow-lg) p-7 sm:p-9">
          <span className="absolute -top-6 -right-3 w-24 h-24 rounded-full bg-white border-[2.5px] border-[var(--shadow-ink)] shadow-(--shadow-sm) flex items-center justify-center display text-xl rotate-[-12deg]">A1 → C2</span>
          <p className="text-lg leading-relaxed mb-6 pr-16 sm:pr-20">
            A short multiple-choice test that gets harder as you go — from A1 (beginner) up to C2.
            It checks both <span className="font-extrabold">grammar</span> and <span className="font-extrabold">vocabulary</span>,
            then starts you at your <span className="font-extrabold">weaker</span> of the two so you build a solid base.
          </p>
          {currentLevel && (
            <p className="font-bold mb-6">Current level: <span className="chip bg-white border-[var(--shadow-ink)] ml-1">{currentLevel}</span></p>
          )}
          <button onClick={start} className="btn-ink w-full min-h-[3.5rem] text-lg">
            <Sparkles className="w-5 h-5" strokeWidth={2.4} /> {currentLevel ? 'Retake test' : 'On y va !'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'loading' || phase === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <Mascot size={90} className="animate-bounce" />
        <p className="font-bold text-muted">{phase === 'submitting' ? 'Langi is scoring your test…' : 'Loading…'}</p>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="relative fill-card-purple p-8 sm:p-10 text-center mb-8">
          <span className="sticker sticker-big sticker-lime sticker-pop absolute -top-5 -right-2 sm:-right-4">Voilà !</span>
          <Mascot variant="yellow" size={92} className="mx-auto mb-3" />
          <p className="font-bold text-[#ede6ff] mb-1">Your starting level</p>
          <p className="display text-8xl tracking-[-0.05em] mb-3">{result.level}</p>
          <p className="text-[#ede6ff] font-semibold">Langi starts you at decks and grammar around this level.</p>
        </div>

        {result.levelBySkill && Object.keys(result.levelBySkill).length > 0 && (() => {
          const skills = Object.entries(result.levelBySkill)
          const lowest = skills.filter(([, lvl]) => lvl === result.level).map(([s]) => SKILL_LABEL[s] || s)
          const mixed = new Set(skills.map(([, lvl]) => lvl)).size > 1
          return (
            <div className="border-[2.5px] border-line rounded-[24px] p-5 mb-8">
              <p className="meta text-muted mb-3">By skill</p>
              <div className="flex flex-wrap gap-3 mb-3">
                {skills.map(([skill, lvl]) => (
                  <span key={skill} className="flex items-center gap-2 text-sm">
                    <span className="meta text-muted">{SKILL_LABEL[skill] || skill}</span>
                    <span className={`chip ${lvl === result.level ? 'bg-yellow text-on-bright border-[var(--shadow-ink)]' : ''}`}>{lvl}</span>
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted leading-snug">
                {mixed
                  ? `We start you at ${result.level} — your ${lowest.join(' & ')} level — so you build a solid foundation before climbing. Stronger skills will move up quickly.`
                  : `Your skills are balanced at ${result.level}.`}
              </p>
            </div>
          )
        })()}

        <p className="meta text-muted mb-3">Score by level</p>
        <div className="space-y-2 mb-8">
          {LEVEL_ORDER.filter((l) => result.scoreByLevel[l]?.total).map((l) => {
            const s = result.scoreByLevel[l]
            const pct = (s.correct / s.total) * 100
            return (
              <div key={l} className="flex items-center gap-3">
                <span className="chip w-12 justify-center">{l}</span>
                <div className="flex-1 h-4 border-2 border-line rounded-full overflow-hidden">
                  <div className="h-full bg-lime border-r-2 border-[var(--shadow-ink)] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="meta text-muted w-12 text-right">{s.correct}/{s.total}</span>
              </div>
            )
          })}
        </div>
        <Link href="/learn" className="btn-ink w-full min-h-[3.5rem] text-lg">Start learning</Link>
      </div>
    )
  }

  // active
  const q = questions[idx]
  if (!q) return null
  const progress = (idx / questions.length) * 100

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="circle-arrow w-11 h-11 hover:bg-paper-dark disabled:opacity-40"
          aria-label="Previous question"
        >
          <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={2.6} />
        </button>
        <div className="progress-pill flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={idx} aria-label="Test progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="font-extrabold text-sm tabular-nums">{idx + 1} / {questions.length}</span>
      </div>

      <div className="brut-card shadow-(--shadow-lg) p-6 sm:p-8 mb-6">
        <span className="chip bg-yellow text-on-bright border-[var(--shadow-ink)] mb-4">{q.level} · {q.kind}</span>
        <p className="display text-2xl sm:text-3xl leading-snug">{q.prompt}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => choose(i)}
            aria-pressed={answers[q.id] === i}
            className={`brut-card w-full min-h-14 text-left px-5 py-3 flex items-center gap-3 font-bold rounded-full ${answers[q.id] === i ? 'bg-purple! text-on-purple border-[var(--shadow-ink)]!' : ''}`}
          >
            <span className="kbd shrink-0">{i + 1}</span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
