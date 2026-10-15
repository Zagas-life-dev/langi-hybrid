'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus } from 'lucide-react'

// Owner/admin controls for a playlist: add videos (paste a YouTube link or ID),
// toggle public/course/official, and delete. Refreshes the server page on change.
function extractVideoId(input: string): string | null {
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s // raw ID
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:embed|shorts)\/([\w-]{11})/)
  return m ? m[1] : null
}

export default function PlaylistManage({
  id,
  isOwner,
  isAdmin,
  initialPublic,
  initialCourse,
  initialOfficial,
}: {
  id: string
  isOwner: boolean
  isAdmin: boolean
  initialPublic: boolean
  initialCourse: boolean
  initialOfficial: boolean
}) {
  const router = useRouter()
  const [isPublic, setIsPublic] = useState(initialPublic)
  const [isCourse, setIsCourse] = useState(initialCourse)
  const [isOfficial, setIsOfficial] = useState(initialOfficial)
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    router.refresh()
  }

  async function addVideo(e: React.FormEvent) {
    e.preventDefault()
    const videoId = extractVideoId(url)
    if (!videoId) {
      setMsg('Paste a valid YouTube link or 11-character video ID.')
      return
    }
    setMsg(null)
    const res = await fetch(`/api/playlists/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    })
    if (res.ok) {
      setUrl('')
      router.refresh()
    } else {
      const d = await res.json()
      setMsg(d.error || 'Could not add video.')
    }
  }

  async function remove() {
    if (!confirm('Delete this playlist? This cannot be undone.')) return
    const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/courses')
  }

  if (!isOwner && !isAdmin) return null

  return (
    <div className="brut-card p-5 mb-8 space-y-4">
      <p className="meta text-muted">Manage</p>

      {isOwner && (
        <>
          <form onSubmit={addVideo} className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a YouTube link or video ID…"
              className="flex-1 px-3 py-2 border-2 border-line rounded-full bg-paper-raised text-sm focus:outline-none focus:border-accent"
            />
            <button type="submit" className="flex items-center gap-1 px-3 py-2 border-2 border-line rounded-full bg-accent text-on-accent text-sm font-bold">
              <Plus className="w-4 h-4" /> Add
            </button>
          </form>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPublic} onChange={(e) => { setIsPublic(e.target.checked); patch({ isPublic: e.target.checked }) }} />
              Public
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isCourse} onChange={(e) => { setIsCourse(e.target.checked); patch({ isCourse: e.target.checked }) }} />
              Course (ordered)
            </label>
          </div>
        </>
      )}

      {isAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isOfficial} onChange={(e) => { setIsOfficial(e.target.checked); patch({ isOfficial: e.target.checked }) }} />
          Official course (featured to all learners)
        </label>
      )}

      {msg && <p className="meta text-accent2">{msg}</p>}

      {(isOwner || isAdmin) && (
        <button onClick={remove} className="flex items-center gap-2 text-sm text-accent2 hover:underline">
          <Trash2 className="w-4 h-4" /> Delete playlist
        </button>
      )}
    </div>
  )
}
