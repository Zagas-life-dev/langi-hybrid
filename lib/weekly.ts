// Pure week helpers shared by the weekly digest and the weekly league. Weeks run
// Monday → Sunday over the same local 'YYYY-MM-DD' keys DailyActivity uses.

const DAY_MS = 86_400_000

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The 7 date keys (Mon..Sun) of the week containing `now`, shifted by `weeksBack`. */
export function weekDateKeys(now: Date, weeksBack = 0): string[] {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sinceMonday = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  const monday = new Date(d.getTime() - (sinceMonday + 7 * weeksBack) * DAY_MS)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i) // setDate, not +ms, so DST shifts don't skip a day
    return key(day)
  })
}

export interface DayRow {
  date: string
  xp?: number
  reviews?: number
  correct?: number
  mistakes?: number
  grammarDrills?: number
  sentences?: number
  chats?: number
  videos?: number
  goalMet?: boolean
}

export interface WeekSummary {
  xp: number
  activeDays: number
  goalDays: number
  cards: number        // reviews + mistakes + grammar drills
  accuracy: number | null // correct / (reviews + mistakes), null if none
  speaking: number     // chats + sentences
  videos: number
}

export function summarizeWeek(rows: DayRow[]): WeekSummary {
  let xp = 0, activeDays = 0, goalDays = 0, cards = 0, answered = 0, correct = 0, speaking = 0, videos = 0
  for (const r of rows) {
    const dayXp = r.xp || 0
    xp += dayXp
    if (dayXp > 0) activeDays++
    if (r.goalMet) goalDays++
    cards += (r.reviews || 0) + (r.mistakes || 0) + (r.grammarDrills || 0)
    answered += (r.reviews || 0) + (r.mistakes || 0)
    correct += r.correct || 0
    speaking += (r.chats || 0) + (r.sentences || 0)
    videos += r.videos || 0
  }
  return { xp, activeDays, goalDays, cards, accuracy: answered ? correct / answered : null, speaking, videos }
}

/** Push title/body for the Sunday digest, comparing with the week before. */
export function digestMessage(week: WeekSummary, prev: WeekSummary): { title: string; body: string } {
  if (week.activeDays === 0) {
    return {
      title: 'A fresh week starts tomorrow 🌱',
      body: 'No study this week — five minutes a day is enough to get the habit back.',
    }
  }
  const parts = [
    `${week.cards} cards`,
    week.accuracy !== null ? `${Math.round(week.accuracy * 100)}% accuracy` : null,
    week.speaking ? `${week.speaking} speaking/writing sessions` : null,
    week.videos ? `${week.videos} videos` : null,
  ].filter(Boolean)
  const delta = week.xp - prev.xp
  const trend = prev.xp === 0 ? '' : delta >= 0 ? ` (+${delta} vs last week)` : ` (${delta} vs last week)`
  return {
    title: `Your week: ${week.xp} XP${trend} 📈`,
    body: `${week.activeDays}/7 days active · ${parts.join(' · ')}.`,
  }
}
