// Resume-point rules shared by the watch page and the Continue watching row.

const MIN_RESUME_S = 10   // don't bother resuming the first few seconds
const END_MARGIN_S = 15   // nor the credits

/** Where to resume, or undefined to start from the beginning. */
export function resumePoint(position?: number, duration?: number): number | undefined {
  if (!position || position < MIN_RESUME_S) return undefined
  if (duration && position > duration - END_MARGIN_S) return undefined
  return Math.floor(position)
}

/** Fraction watched (0–1) for a progress bar, or undefined if there's nothing to resume. */
export function watchProgress(position?: number, duration?: number): number | undefined {
  if (!duration || resumePoint(position, duration) === undefined) return undefined
  return Math.min(1, position! / duration)
}

/**
 * A `t` link parameter in any form YouTube uses — `302`, `302s`, `5m2s`,
 * `1h2m3s` — or a clock time like `28:22`. Seconds, or undefined if unreadable.
 */
export function parseTimestamp(t?: string | null): number | undefined {
  const s = (t ?? '').trim().toLowerCase()
  if (!s) return undefined
  if (/^\d+(\.\d+)?s?$/.test(s)) return Math.floor(parseFloat(s))
  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (hms && (hms[1] || hms[2] || hms[3])) return (+(hms[1] ?? 0)) * 3600 + (+(hms[2] ?? 0)) * 60 + (+(hms[3] ?? 0))
  const clock = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (clock) return (+(clock[1] ?? 0)) * 3600 + (+clock[2]) * 60 + (+clock[3])
  return undefined
}
