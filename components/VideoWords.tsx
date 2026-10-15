'use client'
import { useCallback, useEffect, useState } from 'react'
import { BookmarkCheck, Play, TextQuote } from 'lucide-react'
import { getActivePlayer, WORD_SAVED_EVENT } from '@/lib/ytPlayer'

interface Word { term: string; translation: string; t: number | null; line?: boolean }

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** "Words from this video" — what you saved while watching, each a jump-back link. */
export default function VideoWords({ videoId }: { videoId: string }) {
  const [words, setWords] = useState<Word[]>([])

  const load = useCallback(() => {
    fetch(`/api/videos/${videoId}/words`)
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d) => setWords(d.words || []))
      .catch(() => {})
  }, [videoId])

  useEffect(() => {
    load()
    window.addEventListener(WORD_SAVED_EVENT, load)
    return () => window.removeEventListener(WORD_SAVED_EVENT, load)
  }, [load])

  if (!words.length) return null

  function seek(t: number) {
    const p = getActivePlayer(videoId)
    if (!p) return
    p.seekTo(Math.max(0, t - 2), true) // a little lead-in so the word is in context
    p.playVideo()
  }

  return (
    <section className="border-[2.5px] border-line rounded-[24px] p-4 mt-5">
      <p className="meta text-muted mb-3 flex items-center gap-2">
        <BookmarkCheck className="w-4 h-4 text-accent" strokeWidth={2.2} /> Words from this video ({words.length})
      </p>
      <ul className="flex flex-wrap gap-2">
        {words.map((w) => (
          <li key={`${w.line ? 'line' : 'word'}:${w.term}:${w.t}`}>
            <button
              onClick={() => w.t !== null && seek(w.t)}
              disabled={w.t === null}
              className="inline-flex items-center gap-2 border-2 border-line rounded-full px-2.5 py-1.5 text-sm hover:bg-paper-dark disabled:cursor-default"
              title={w.t !== null ? `Jump to ${fmt(w.t)}` : undefined}
            >
              {w.line && <TextQuote className="w-3.5 h-3.5 text-muted" strokeWidth={2.2} aria-label="Saved line" />}
              <strong>{w.term}</strong>
              <span className="text-muted">{w.translation}</span>
              {w.t !== null && <span className="meta text-accent inline-flex items-center gap-0.5"><Play className="w-3 h-3" />{fmt(w.t)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
