// Age helpers for content gating. We store a date of birth (collected at signup)
// and derive adult status from it — never trust a client-sent "I'm an adult" flag;
// mature content is decided server-side from this.
export const ADULT_AGE = 18

export function ageFromBirthdate(birthdate?: Date | string | null): number | null {
  if (!birthdate) return null
  const d = new Date(birthdate)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

export function isAdult(birthdate?: Date | string | null): boolean {
  const a = ageFromBirthdate(birthdate)
  return a !== null && a >= ADULT_AGE
}

/** Validate a YYYY-MM-DD (or ISO) DOB: a real past date, not absurdly old. */
export function parseBirthdate(input?: string | null): Date | null {
  if (!input) return null
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  if (d > now) return null
  if (d.getFullYear() < 1900) return null
  return d
}
