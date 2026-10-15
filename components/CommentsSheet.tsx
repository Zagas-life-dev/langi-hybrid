'use client'
import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'

interface CommentItem { id: string; displayName: string; text: string; createdAt: string | Date }

// Bottom-sheet comments for the Shorts feed (the watch page uses VideoComments
// inline). Loads the thread on open and posts via the same comments API.
export default function CommentsSheet({ videoId, open, onClose }: { videoId: string; open: boolean; onClose: () => void }) {
  const [comments, setComments] = useState<CommentItem[] | null>(null)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments(null) // show loading, then fetch the thread
    fetch(`/api/videos/${videoId}/comments`)
      .then((r) => r.json())
      .then((d) => { if (active) setComments(d.comments || []) })
      .catch(() => { if (active) setComments([]) })
    return () => { active = false }
  }, [open, videoId])

  async function post(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body }),
      })
      const data = await res.json()
      if (res.ok) { setComments((c) => [data.comment, ...(c || [])]); setText('') }
    } catch {
      /* ignore — user can retry */
    }
    setPosting(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md bg-paper border-t border-x border-line max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <span className="display font-display text-lg">{comments?.length ?? 0} comment{comments?.length === 1 ? '' : 's'}</span>
          <button onClick={onClose} aria-label="Close comments" className="text-muted hover:text-ink">
            <X className="w-5 h-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {comments === null && <p className="meta text-muted">Loading…</p>}
          {comments?.length === 0 && <p className="text-muted text-sm">Be the first to comment.</p>}
          {comments?.map((c) => (
            <div key={c.id} className="border-b border-line/15 pb-3">
              <p className="text-sm font-medium mb-0.5">{c.displayName}</p>
              <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
        </div>

        <form onSubmit={post} className="flex items-center gap-2 p-3 border-t border-line shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 px-3 py-2 border-2 border-line rounded-full bg-paper-raised text-sm focus:outline-none focus:border-accent"
          />
          <button type="submit" disabled={posting || !text.trim()} className="circle-arrow w-10 h-10 shrink-0 bg-purple text-on-purple hover:bg-accent hover:border-accent disabled:opacity-50" aria-label="Post comment">
            <Send className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </form>
      </div>
    </div>
  )
}
