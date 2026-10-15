'use client'
import { useState } from 'react'
import { ArrowRight, Check, X, BookOpen } from 'lucide-react'
import { haptic } from '@/lib/haptics'

export interface InterludeQuestion {
  id: string
  level: string
  concept: string
  prompt: string
  options: string[]
}

/**
 * One grammar-concept question slipped between flashcards (interleaving beats
 * blocked practice for retention). Answers go through the normal grammar SRS
 * route, so it advances that question's box and counts toward the daily goal.
 */
export default function GrammarInterlude({ q, onDone }: { q: InterludeQuestion; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<{ correct: boolean; answerIndex: number; explanation: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function choose(i: number) {
    if (busy || result) return
    setBusy(true)
    setPicked(i)
    try {
      const res = await fetch('/api/grammar/practice/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: q.id, choice: i }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ correct: data.correct, answerIndex: data.answerIndex, explanation: data.explanation || '' })
        haptic(data.correct ? 'success' : 'error')
      } else onDone() // never block the review on a grammar hiccup
    } catch {
      onDone()
    }
    setBusy(false)
  }

  return (
    <div className="card-enter">
      <p className="meta text-accent mb-3 flex items-center gap-2">
        <BookOpen className="w-4 h-4" strokeWidth={2.2} /> Grammar check · {q.level} · {q.concept}
      </p>
      <div className="border-[2.5px] border-line rounded-[32px] bg-paper-raised p-6 mb-5 shadow-(--shadow-lg)">
        <p className="text-xl leading-snug">{q.prompt}</p>
      </div>
      <div className="space-y-3 mb-4">
        {q.options.map((opt, i) => {
          const isAnswer = result && result.answerIndex === i
          const wrongPick = result && picked === i && !result.correct
          return (
            <button key={i} onClick={() => choose(i)} disabled={busy || !!result}
              className={`brut-card w-full text-left p-4 flex items-center justify-between gap-3 ${
                isAnswer ? 'border-ok bg-ok/5' : wrongPick ? 'border-accent2 bg-accent2/5' : ''
              }`}>
              <span>{opt}</span>
              {isAnswer && <Check className="w-4 h-4 text-ok shrink-0" />}
              {wrongPick && <X className="w-4 h-4 text-accent2 shrink-0" />}
            </button>
          )
        })}
      </div>
      {result && (
        <>
          {result.explanation && <p className="text-sm text-ink-soft mb-4">{result.explanation}</p>}
          <button onClick={onDone} className="btn-ink w-full" autoFocus>
            Back to cards <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
      {!result && (
        <button onClick={onDone} className="meta text-muted hover:text-accent">Skip</button>
      )}
    </div>
  )
}
