'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ListPlus, Check } from 'lucide-react'

interface MyPlaylist {
  id: string
  title: string
  isCourse: boolean
}

// Dropdown to add the current video to one of the user's playlists. Lazily loads
// the user's playlists when first opened. `dropUp` opens the menu upward (used in
// the Shorts bottom bar where a downward menu would fall off-screen).
export default function AddToPlaylist({ videoId, dropUp = false }: { videoId: string; dropUp?: boolean }) {
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState<MyPlaylist[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && lists === null) {
      setLoading(true)
      try {
        const res = await fetch('/api/playlists')
        const data = await res.json()
        setLists(data.mine || [])
      } catch {
        setLists([])
      } finally {
        setLoading(false)
      }
    }
  }

  async function add(playlistId: string) {
    setMsg(null)
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })
      const data = await res.json()
      setMsg(res.ok ? (data.alreadyAdded ? 'Already in that playlist' : 'Added!') : data.error || 'Could not add')
    } catch {
      setMsg('Network error')
    }
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-2 border-2 border-line rounded-full text-sm font-bold hover:bg-paper-dark transition-colors"
      >
        <ListPlus className="w-4 h-4" strokeWidth={2.2} /> Add to playlist
      </button>

      {open && (
        <div className={`absolute z-30 w-64 border-[2.5px] border-line rounded-[32px] bg-paper-raised shadow-(--shadow-lg) p-2 ${dropUp ? 'bottom-full mb-2' : 'mt-2'}`}>
          {loading && <p className="meta text-muted p-2">Loading…</p>}
          {!loading && lists && lists.length === 0 && (
            <p className="meta text-muted p-2">
              No playlists yet. Create one on the <Link href="/courses/new" className="text-accent underline">Courses</Link> page.
            </p>
          )}
          {!loading &&
            lists?.map((l) => (
              <button
                key={l.id}
                onClick={() => add(l.id)}
                className="w-full text-left px-2 py-2 text-sm hover:bg-paper-dark transition-colors flex items-center justify-between"
              >
                <span className="truncate">{l.title}</span>
                {l.isCourse && <span className="meta text-muted ml-2">course</span>}
              </button>
            ))}
          {msg && (
            <p className="meta text-accent p-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> {msg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
