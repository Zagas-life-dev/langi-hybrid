// Pure pieces of the weekly league (no DB) — ranking and handles.

export interface LeagueRow {
  userId: string
  name: string
  xp: number
  isMe: boolean
}

export interface RankedRow extends LeagueRow {
  rank: number
}

/** Highest weekly XP first; equal XP shares a rank ("1, 2, 2, 4"). */
export function rankRows(rows: LeagueRow[]): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
  let rank = 0
  let prevXp: number | null = null
  return sorted.map((r, i) => {
    if (r.xp !== prevXp) { rank = i + 1; prevXp = r.xp }
    return { ...r, rank }
  })
}

/**
 * Public handle for someone on the board. Never derived from the email — a
 * learner who hasn't set a display name shows as an anonymous handle.
 */
export function publicName(displayName: string | undefined | null, userId: string): string {
  const n = (displayName || '').trim()
  return n ? n.slice(0, 24) : `Learner ${userId.slice(-4).toUpperCase()}`
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

/** A short, unambiguous friend code, e.g. "K7QM2X". */
export function makeFriendCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')
}

export function normalizeFriendCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}
