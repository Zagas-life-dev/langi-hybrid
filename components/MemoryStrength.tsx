// Leitner box distribution bar + legend. Shared by the dashboard and the
// progress page. Colours come from the --box-* tokens, the same five fills
// the flashcards and box tiles use.

interface Dist {
  newCount: number
  boxes: Record<number, number>
}

export default function MemoryStrength({ dist, label }: { dist: Dist; label: string }) {
  const segments = [
    { label: 'New', value: dist.newCount, color: 'var(--paper-raised)' },
    { label: 'Box 1', value: dist.boxes[1], color: 'var(--box-1)' },
    { label: 'Box 2', value: dist.boxes[2], color: 'var(--box-2)' },
    { label: 'Box 3', value: dist.boxes[3], color: 'var(--box-3)' },
    { label: 'Box 4', value: dist.boxes[4], color: 'var(--box-4)' },
    { label: 'Box 5', value: dist.boxes[5], color: 'var(--box-5)' },
  ]
  const total = segments.reduce((a, s) => a + s.value, 0) || 1

  return (
    <div>
      <p className="font-extrabold mb-3">{label}</p>
      {/* The bar is decorative — the legend below carries the same numbers as
          real text, so screen readers get the data without ARIA gymnastics. */}
      <div className="flex h-7 rounded-full border-[2.5px] border-line overflow-hidden bg-paper-raised" aria-hidden="true">
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${s.value}`}
              className="transition-[width] duration-500 border-r-2 border-[var(--shadow-ink)] last:border-r-0"
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {segments.map((s) => (
          <span key={s.label} className="meta text-muted flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-[var(--shadow-ink)]" style={{ background: s.color }} /> {s.label} {s.value}
          </span>
        ))}
      </div>
    </div>
  )
}
