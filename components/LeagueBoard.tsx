'use client'
import { useCallback, useEffect, useState } from 'react'
import { Trophy, Users, Copy, Check, UserPlus, UserMinus } from 'lucide-react'

type Scope = 'league' | 'friends'
interface Row { userId: string; name: string; xp: number; isMe: boolean; rank: number }

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeagueBoard({ initialScope, langName }: { initialScope: Scope; langName: string }) {
  const [scope, setScope] = useState<Scope>(initialScope)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [friendInput, setFriendInput] = useState('')
  const [friendMsg, setFriendMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async (s: Scope) => {
    setRows(null); setError(null)
    try {
      const res = await fetch(`/api/league?scope=${s}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRows(data.rows)
    } catch (e) {
      setError((e as Error).message || 'Could not load the board')
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(scope) }, [scope, load])

  useEffect(() => {
    if (scope !== 'friends' || code) return
    fetch('/api/friends').then((r) => r.json()).then((d) => d.code && setCode(d.code)).catch(() => {})
  }, [scope, code])

  async function addFriend(e: React.FormEvent) {
    e.preventDefault()
    if (!friendInput.trim() || adding) return
    setAdding(true); setFriendMsg(null)
    try {
      const res = await fetch('/api/friends', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: friendInput }),
      })
      const data = await res.json()
      setFriendMsg(res.ok ? `Added ${data.name}!` : data.error)
      if (res.ok) { setFriendInput(''); load('friends') }
    } catch { setFriendMsg('Network error') }
    setAdding(false)
  }

  async function unfriend(id: string, name: string) {
    if (!confirm(`Remove ${name} from your friends?`)) return
    await fetch(`/api/friends?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    load('friends')
  }

  function copyCode() {
    if (!code) return
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <p className="meta text-muted mb-2">This week · resets Monday</p>
      <h1 className="display font-display text-4xl sm:text-5xl mb-6">League</h1>

      <div className="flex gap-2 mb-6">
        {([['league', `${langName} learners`, Trophy], ['friends', 'Friends', Users]] as const).map(([s, label, Icon]) => (
          <button key={s} onClick={() => setScope(s)}
            className={`flex-1 p-3 border-2 border-line rounded-full flex items-center justify-center gap-2 text-sm font-bold ${scope === s ? 'bg-purple text-on-purple' : 'hover:bg-paper-dark'}`}>
            <Icon className="w-4 h-4" strokeWidth={2.2} /> {label}
          </button>
        ))}
      </div>

      {scope === 'friends' && (
        <div className="border-[2.5px] border-line rounded-[24px] p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">Your friend code</p>
            <button onClick={copyCode} disabled={!code} className="inline-flex items-center gap-2 font-mono text-lg tracking-widest hover:text-accent">
              {code || '······'} {copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" strokeWidth={2.2} />}
            </button>
          </div>
          <form onSubmit={addFriend} className="flex gap-2">
            <input value={friendInput} onChange={(e) => setFriendInput(e.target.value.toUpperCase())} maxLength={7}
              placeholder="Friend's code" className="field-brut flex-1 font-mono tracking-widest uppercase" autoComplete="off" />
            <button disabled={adding || !friendInput.trim()} className="btn-ink"><UserPlus className="w-4 h-4" /> Add</button>
          </form>
          {friendMsg && <p className="meta text-muted">{friendMsg}</p>}
        </div>
      )}

      {error && <p className="meta text-accent2">{error}</p>}
      {!rows && !error && <p className="meta text-muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="text-muted">{scope === 'friends' ? 'Add a friend with their code to start a friendly race.' : 'No XP earned yet this week — be the first!'}</p>
      )}
      {rows && rows.length > 0 && (
        <ol className="border-[2.5px] border-line rounded-[24px] overflow-hidden divide-y divide-line/25">
          {rows.map((r) => (
            <li key={r.userId} className={`flex items-center gap-3 px-4 py-3 ${r.isMe ? 'bg-accent/10' : ''}`}>
              <span className="w-8 text-center font-mono">{MEDAL[r.rank] || r.rank}</span>
              <span className="flex-1 min-w-0 truncate">{r.name}{r.isMe && <span className="meta text-accent ml-2">you</span>}</span>
              <span className="font-mono">{r.xp} XP</span>
              {scope === 'friends' && !r.isMe && (
                <button onClick={() => unfriend(r.userId, r.name)} className="text-muted hover:text-accent2" aria-label={`Remove ${r.name}`}>
                  <UserMinus className="w-4 h-4" strokeWidth={2.2} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="meta text-muted mt-4">Your name here comes from Settings → display name. Without one you appear anonymously.</p>
    </div>
  )
}
