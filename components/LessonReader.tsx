'use client'
import { useEffect, useMemo, useRef } from 'react'
import { useReadAloud } from '@/lib/speech'
import { useLang } from '@/components/LangProvider'
import ReadAloudBar from '@/components/ReadAloud'
// Straight from the cache contract — the pre-warm script uses the same splitter.
import { toSegments, SURFACE_STYLE, nativeSpeechTag } from '@/lib/segments'

/**
 * Read-along wrapper for grammar-lesson prose.
 *
 * Note the language choice: a lesson explanation is written in the learner's
 * NATIVE language (it's teaching *about* the target language), so it's spoken
 * with the native tag. The target-language example sentences are handled
 * separately by GrammarDrill, which speaks them in the learning language.
 */
export default function LessonReader({
  title,
  summary,
  paragraphs,
}: {
  title: string
  summary?: string
  paragraphs: string[]
}) {
  const { nativeLang } = useLang()

  // Speech advances a sentence at a time (a whole highlighted paragraph is
  // useless for following along), but the page must still READ as paragraphs.
  // So: one flat segment list for playback, plus the index range each paragraph
  // occupies within it for rendering.
  const { segments, ranges } = useMemo(() => {
    const segs: string[] = []
    // Index 0 is the summary when present, so body indices are offset by 1.
    if (summary) segs.push(summary)
    const rs: { start: number; end: number }[] = []
    for (const p of paragraphs) {
      const s = toSegments(p)
      rs.push({ start: segs.length, end: segs.length + s.length })
      segs.push(...s)
    }
    return { segments: segs, ranges: rs }
  }, [paragraphs, summary])

  // 'teacher': calm, patient explanation rather than performance. Both the tag
  // and the style come from lib/segments so pre-warmed audio matches this key.
  const ra = useReadAloud(segments, nativeSpeechTag(nativeLang), undefined, {
    style: SURFACE_STYLE.lesson,
  })

  // Keep the sentence being spoken on screen during a long lesson.
  const activeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (ra.index < 0) return
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ra.index])

  return (
    <>
      <h1 className="display font-display text-3xl sm:text-4xl mb-2">{title}</h1>
      {summary && (
        <p className="mb-6 text-muted">
          <span
            ref={ra.index === 0 ? activeRef : undefined}
            className="read-seg"
            data-active={ra.index === 0}
            data-clickable="true"
            onClick={() => ra.jump(0)}
            title="Read from here"
          >
            {summary}
          </span>
        </p>
      )}

      <ReadAloudBar controls={ra} count={segments.length} label="Read lesson" className="mb-6" />

      <article className="mb-10">
        {paragraphs.map((_, pi) => {
          const { start, end } = ranges[pi]
          return (
            <p key={pi} className="leading-relaxed mb-4 last:mb-0">
              {segments.slice(start, end).map((text, k) => {
                const gi = start + k
                return (
                  <span
                    key={gi}
                    ref={ra.index === gi ? activeRef : undefined}
                    className="read-seg"
                    data-active={ra.index === gi}
                    data-clickable="true"
                    onClick={() => ra.jump(gi)}
                    title="Read from here"
                  >
                    {text}{' '}
                  </span>
                )
              })}
            </p>
          )
        })}
      </article>
    </>
  )
}
