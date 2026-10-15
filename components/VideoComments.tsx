'use client'
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'

interface CommentItem {
  id: string
  displayName: string
  text: string
  createdAt: string | Date
}

// Langi-native comment thread for a video. Initial comments are server-rendered
// and passed in; new ones are posted via the API and prepended optimistically.
export default function VideoComments({
  videoId,
  initialComments,
}: {
  videoId: string
  initialComments: CommentItem[]
}) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function post(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || posting) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body }),
      })
      const data = await res.json()
      if (res.ok) {
        setComments((c) => [data.comment, ...c])
        setText('')
      } else {
        setError(data.error || 'Could not post comment.')
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-accent" strokeWidth={2.2} />
        <h2 className="display font-display text-xl">{comments.length} comment{comments.length === 1 ? '' : 's'}</h2>
      </div>

      <form onSubmit={post} className="mb-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share a note or question…"
          rows={2}
          className="w-full px-3 py-2 border-2 border-line rounded-full bg-paper-raised text-sm focus:outline-none focus:border-accent resize-y"
        />
        <div className="flex items-center justify-between mt-2">
          {error ? <p className="meta text-accent2">{error}</p> : <span />}
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="px-4 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </form>

      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="border-b border-line/20 pb-4">
            <p className="text-sm font-medium mb-1">{c.displayName}</p>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.text}</p>
          </li>
        ))}
        {comments.length === 0 && <li className="text-muted text-sm">Be the first to comment.</li>}
      </ul>
    </section>
  )
}
