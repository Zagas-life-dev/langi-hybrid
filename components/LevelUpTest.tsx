'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trophy } from 'lucide-react'

interface Q { id: string; section: 'grammar' | 'vocab'; prompt: string; options: string[] }
interface Verdict {
  target: string
  passed: boolean
  overall: number
  bySection: Record<'grammar' | 'vocab', { correct: number; total: number }>
}

const SECTION_LABEL = { grammar: 'Grammar', vocab: 'Vocabulary' }

export default function LevelUpTest({ from, target }: { from: string; target: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'intro' | 'loading' | 'active' | 'submitting' | 'done' | 'blocked'>('intro')
  const [questions, setQuestions] = useState<Q[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function start() {
    setPhase('loading')
    try {
      const res = await fetch('/api/levelup/form')
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error === 'cooldown'
          ? `You can retry ${new Date(data.retryAt).toLocaleString()} — review your ${from} and ${target} decks in the meantime.`
          : data.error || 'Could not load the test.')
        setPhase('blocked')
        return
      }
      setQuestions(data.questions)
      setIdx(0)
      setAnswers({})
      setPhase('active')
    } catch {
      setMessage('Network error — try again.')
      setPhase('blocked')
    }
  }

  async function pick(option: string) {
    const q = questions[idx]
    const nextAnswers = { ...answers, [q.id]: option }
    setAnswers(nextAnswers)
    if (idx + 1 < questions.length) { setIdx(idx + 1); return }
    setPhase('submitting')
    try {
      const res = await fetch('/api/levelup/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Object.entries(nextAnswers).map(([id, answer]) => ({ id, answer })) }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage(data.error || 'Could not grade'); setPhase('blocked'); return }
      setVerdict(data)
      setPhase('done')
      if (data.passed) router.refresh()
    } catch {
      setMessage('Network error — your answers were not submitted.')
      setPhase('blocked')
    }
  }

  const q = questions[idx]

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/learn" className="meta text-muted hover:text-accent inline-flex items-center gap-2 mb-6">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>

      {phase === 'intro' && (
        <div className="border-[2.5px] border-line rounded-[32px] p-8 shadow-(--shadow-lg)">
          <p className="meta text-muted mb-2">Level-up test</p>
          <h1 className="display font-display text-4xl mb-4">{from} → {target}</h1>
          <p className="text-ink-soft leading-relaxed mb-6">
            About 16 questions on {target} grammar and vocabulary. Score 70% overall — and at least 60% in each
            section — to move up. If you don’t pass, you can try again in 24 hours.
          </p>
          <button onClick={start} className="btn-ink w-full"><Trophy className="w-4 h-4" /> Start</button>
        </div>
      )}

      {phase === 'loading' && <p className="meta text-muted">Building your test…</p>}
      {phase === 'submitting' && <p className="meta text-muted">Grading…</p>}
      {phase === 'blocked' && (
        <div className="border-[2.5px] border-line rounded-[24px] p-6">
          <p className="mb-4">{message}</p>
          <Link href="/learn" className="btn-ink">Back to dashboard</Link>
        </div>
      )}

      {phase === 'active' && q && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="meta text-muted">{idx + 1} / {questions.length}</span>
            <span className="meta text-muted">{SECTION_LABEL[q.section]}</span>
          </div>
          <div className="h-1 bg-ink/10 mb-6"><div className="h-full bg-accent" style={{ width: `${(idx / questions.length) * 100}%` }} /></div>
          <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 mb-5 shadow-(--shadow-lg)">
            <p className="text-xl leading-snug">{q.prompt}</p>
          </div>
          <div className="space-y-3">
            {q.options.map((opt) => (
              <button key={opt} onClick={() => pick(opt)} className="brut-card w-full text-left p-4">{opt}</button>
            ))}
          </div>
        </div>
      )}

      {phase === 'done' && verdict && (
        <div className="border-[2.5px] border-line rounded-[32px] p-8 shadow-(--shadow-lg) text-center">
          <p className="display font-display text-5xl mb-2">{Math.round(verdict.overall * 100)}%</p>
          <p className="display font-display text-2xl mb-4">
            {verdict.passed ? `Welcome to ${verdict.target}!` : 'Not quite yet'}
          </p>
          <div className="flex justify-center gap-6 mb-6">
            {(['grammar', 'vocab'] as const).map((s) => verdict.bySection[s].total > 0 && (
              <div key={s}>
                <p className="meta text-muted">{SECTION_LABEL[s]}</p>
                <p className="font-medium">{verdict.bySection[s].correct}/{verdict.bySection[s].total}</p>
              </div>
            ))}
          </div>
          <p className="text-muted text-sm mb-6">
            {verdict.passed
              ? `New ${verdict.target} decks, stories and grammar are now unlocked.`
              : `Keep reviewing and practising ${verdict.target} grammar — you can retry in 24 hours.`}
          </p>
          <Link href="/learn" className="btn-ink">Back to dashboard</Link>
        </div>
      )}
    </div>
  )
}
