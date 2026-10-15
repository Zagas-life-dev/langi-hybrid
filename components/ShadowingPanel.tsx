'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Volume2, X } from 'lucide-react'
import { useTTS } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import PronunciationCheck from '@/components/PronunciationCheck'

/**
 * Shadowing: hear a sentence, say it straight back, get a per-word score, move
 * on. Works over any list of sentences (stories today). The model sentence
 * auto-plays on each step, as shadowing is imitation — listen first, then speak.
 */
export default function ShadowingPanel({
  sentences,
  onClose,
}: {
  sentences: { text: string; translation?: string }[]
  onClose: () => void
}) {
  const { speechTag, ttsVoice } = useLang()
  const tts = useTTS(speechTag, ttsVoice)
  const [i, setI] = useState(0)
  const [scores, setScores] = useState<Record<number, number>>({})
  const current = sentences[i]

  // Play the model whenever the learner lands on a new sentence.
  useEffect(() => {
    if (current && tts.supported) tts.speak(current.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  if (!current) return null
  const done = Object.keys(scores).length
  const avg = done ? Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / done) : null

  return (
    <section className="border border-accent p-4 mb-8 bg-paper-dark" aria-label="Shadowing practice">
      <div className="flex items-center justify-between mb-3">
        <p className="meta text-accent">Shadowing · {i + 1} / {sentences.length}</p>
        <div className="flex items-center gap-3">
          {avg !== null && <span className="meta text-muted">avg {avg}/100</span>}
          <button onClick={onClose} className="text-muted hover:text-accent" aria-label="Close shadowing"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => tts.speak(current.text)} className="btn-ghost text-sm" disabled={!tts.supported}>
          <Volume2 className="w-4 h-4" /> Listen again
        </button>
        <span className="meta text-muted">Speed follows your read-aloud setting</span>
      </div>

      {/* Keyed by index so the checker resets between sentences. */}
      <PronunciationCheck
        key={i}
        target={current.text}
        label="Now repeat it"
        onScored={(r) => setScores((s) => ({ ...s, [i]: Math.max(s[i] ?? 0, r.score) }))}
      />
      {current.translation && <p className="text-sm text-muted italic mt-2">{current.translation}</p>}

      <div className="flex items-center justify-between mt-4">
        <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} className="meta text-muted hover:text-accent disabled:opacity-30 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        {i < sentences.length - 1 ? (
          <button onClick={() => setI((n) => n + 1)} className="btn-ink text-sm">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={onClose} className="btn-ink text-sm">Finish{avg !== null ? ` · ${avg}/100` : ''}</button>
        )}
      </div>
    </section>
  )
}
