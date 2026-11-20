'use client'
import { Play, Pause, Square, SkipBack, SkipForward, Gauge } from 'lucide-react'
import { RATE_STEPS, type ReadAloudControls } from '@/lib/speech'

/**
 * Transport bar for continuous read-aloud. The parent owns the useReadAloud
 * hook so it can also drive highlighting from the same `index` — this component
 * is purely the controls.
 */
export default function ReadAloudBar({
  controls,
  count,
  label = 'Read aloud',
  className = '',
}: {
  controls: ReadAloudControls
  count: number
  label?: string
  className?: string
}) {
  const { supported, status, index, toggle, stop, next, prev, rate, setRate } = controls

  if (!supported) {
    return (
      <p className={`meta text-muted ${className}`}>
        Read-aloud needs a browser with speech support (Chrome, Edge or Safari).
      </p>
    )
  }
  if (count === 0) return null

  const active = status !== 'idle'

  return (
    <div className={className}>
    <div className="flex items-center gap-2 flex-wrap border-[2.5px] border-line rounded-[24px] p-2">
      <button
        onClick={toggle}
        className="btn-ink px-4 py-2 min-h-0"
        aria-label={status === 'playing' ? 'Pause reading' : 'Read aloud'}
      >
        {status === 'playing' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <span className="hidden sm:inline">{status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : label}</span>
      </button>

      {/* Sentence stepping only matters once there's a position to step from. */}
      <button onClick={prev} disabled={!active || index <= 0} className="circle-arrow w-9 h-9 disabled:opacity-30 hover:bg-paper-dark" aria-label="Previous sentence">
        <SkipBack className="w-4 h-4" strokeWidth={2.2} />
      </button>
      <button onClick={next} disabled={!active || index >= count - 1} className="circle-arrow w-9 h-9 disabled:opacity-30 hover:bg-paper-dark" aria-label="Next sentence">
        <SkipForward className="w-4 h-4" strokeWidth={2.2} />
      </button>
      <button onClick={stop} disabled={!active} className="circle-arrow w-9 h-9 disabled:opacity-30 hover:bg-paper-dark" aria-label="Stop reading">
        <Square className="w-4 h-4" strokeWidth={2.2} />
      </button>

      {active && (
        <span className="meta text-muted tabular-nums" aria-live="polite">
          {index + 1} / {count}
        </span>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <label className="flex items-center gap-1.5 meta text-muted">
          <Gauge className="w-4 h-4" strokeWidth={2.2} />
          <span className="sr-only">Reading speed</span>
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="field-brut w-auto min-h-0 py-1 px-1.5 text-xs"
          >
            {RATE_STEPS.map((r) => (
              <option key={r} value={r}>{r}×</option>
            ))}
          </select>
        </label>
      </div>
    </div>

    </div>
  )
}
