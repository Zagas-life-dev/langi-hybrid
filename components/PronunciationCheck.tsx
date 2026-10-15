'use client'
import { useCallback, useState } from 'react'
import { Mic, Volume2, RotateCcw, Square } from 'lucide-react'
import { useSavedVoice, useSTT } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import { scorePronunciation, type PronunciationResult, type WordStatus } from '@/lib/pronunciation'

const WORD_CLASS: Record<WordStatus, string> = {
  correct: 'text-ok',
  close: 'text-warn',
  wrong: 'text-accent2 underline decoration-wavy decoration-accent2/60 underline-offset-4',
}

/**
 * Tap-to-speak pronunciation trainer. Plays the model with TTS, listens, then
 * scores what was heard against `target` word-by-word — green = clean, amber =
 * close, red = missed. Reusable across review, sentence practice and stories.
 */
export default function PronunciationCheck({
  target,
  label = 'Say it',
  onScored,
}: {
  target: string
  label?: string
  onScored?: (r: PronunciationResult) => void
}) {
  const { speechTag, ttsVoice } = useLang()
  // Pre-generated clips (overnight run) when stored, the device voice otherwise.
  const tts = useSavedVoice(speechTag, ttsVoice)
  const [result, setResult] = useState<PronunciationResult | null>(null)
  const [heardRaw, setHeardRaw] = useState('')

  const handle = useCallback(
    (t: string) => {
      setHeardRaw(t)
      const r = scorePronunciation(target, t)
      setResult(r)
      onScored?.(r)
    },
    [target, onScored]
  )
  const stt = useSTT(speechTag, handle)

  const reset = () => {
    setResult(null)
    setHeardRaw('')
  }
  const restart = () => {
    reset()
    stt.start()
  }

  if (!stt.supported) {
    return (
      <p className="meta text-muted">Pronunciation practice needs Chrome or Edge.</p>
    )
  }

  const headline =
    result?.verdict === 'great' ? 'Oui ! Nailed it' : result?.verdict === 'good' ? 'Presque ! Almost there' : 'Give it another go'

  return (
    <div className="border-[2.5px] border-line rounded-[24px] p-4">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => (stt.listening ? stt.stop() : restart())}
          className={`circle-arrow w-11 h-11 shrink-0 ${stt.listening ? 'bg-accent text-on-accent border-accent animate-pulse' : 'hover:bg-paper-dark'}`}
          aria-label={stt.listening ? 'Stop' : 'Speak'}
        >
          {stt.listening ? <Square className="w-4 h-4" strokeWidth={2.2} /> : <Mic className="w-4 h-4" strokeWidth={2.2} />}
        </button>
        <div className="min-w-0">
          <p className="meta text-muted leading-tight">{stt.listening ? 'Listening… say it now' : label}</p>
          <p className="leading-tight">
            {target}
            {tts.supported && (
              <button onClick={() => tts.speak(target)} className="ml-2 align-middle text-muted hover:text-accent" aria-label="Hear">
                <Volume2 className="w-4 h-4 inline" strokeWidth={2.2} />
              </button>
            )}
          </p>
        </div>
      </div>

      {result && (
        <div className="pt-3 border-t border-line/10">
          <div className="flex items-baseline justify-between mb-2">
            <span className="meta text-muted">{headline}</span>
            <span className="display font-display text-3xl">
              {result.score}
              <span className="text-sm text-muted">/100</span>
            </span>
          </div>
          <p className="leading-relaxed text-lg">
            {result.words.map((w, i) => (
              <span key={i} className={WORD_CLASS[w.status]}>
                {w.text}
                {i < result.words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
          {heardRaw && <p className="meta text-muted mt-2">Heard: “{heardRaw}”</p>}
          <button onClick={restart} className="meta text-muted hover:text-accent flex items-center gap-1.5 mt-3">
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}
    </div>
  )
}
