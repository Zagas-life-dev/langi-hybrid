import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import Deck from '@/lib/models/Deck'
import Card from '@/lib/models/Card'
import UserCard from '@/lib/models/UserCard'
import type { ICard } from '@/lib/models/Card'
import type { IUserCard } from '@/lib/models/UserCard'
import { NEW_PER_SESSION } from '@/lib/srs-core'

// Re-export the pure SRS logic so callers can keep importing from '@/lib/srs'.
export * from '@/lib/srs-core'

// --- Queue & stats (DB) ----------------------------------------------------

export interface DueItem {
  card: ICard
  userCard: IUserCard | null
}

/**
 * Cards due for review now, plus up to NEW_PER_SESSION brand-new cards.
 * `deckId` omitted or 'all' = global queue across the language's system decks.
 */
export async function getDueCards(userId: string, lang: string, deckId?: string): Promise<DueItem[]> {
  await connectDB()
  const deckQuery = deckId && deckId !== 'all'
    ? { _id: new Types.ObjectId(deckId) }
    : { languageCode: lang }
  const decks = await Deck.find(deckQuery).select('_id').lean()
  const deckIds = decks.map((d) => d._id)
  const cards = await Card.find({ deckId: { $in: deckIds } })
  const cardIds = cards.map((c) => c._id)
  const userCards = await UserCard.find({ userId, cardId: { $in: cardIds } })
  const ucByCard = new Map(userCards.map((uc) => [String(uc.cardId), uc]))

  const now = new Date()
  const dueReviews: DueItem[] = []
  const newCards: DueItem[] = []
  for (const card of cards) {
    const uc = ucByCard.get(String(card._id))
    if (!uc) newCards.push({ card, userCard: null })
    else if (uc.dueAt <= now) dueReviews.push({ card, userCard: uc })
  }
  dueReviews.sort((a, b) => a.userCard!.dueAt.getTime() - b.userCard!.dueAt.getTime())
  return [...dueReviews, ...newCards.slice(0, NEW_PER_SESSION)]
}

/** Per-deck "to review" counts (new + due-now) for the dashboard. */
export async function deckDueCounts(userId: string, lang: string): Promise<Record<string, number>> {
  await connectDB()
  const decks = await Deck.find({ languageCode: lang }).select('_id').lean()
  const cards = await Card.find({ deckId: { $in: decks.map((d) => d._id) } }).select('_id deckId').lean()
  const userCards = await UserCard.find({ userId, languageCode: lang }).select('cardId dueAt').lean()
  const ucByCard = new Map(userCards.map((uc) => [String(uc.cardId), uc]))
  const now = new Date()
  const counts: Record<string, number> = {}
  for (const card of cards) {
    const uc = ucByCard.get(String(card._id))
    const due = !uc || new Date(uc.dueAt) <= now
    if (due) {
      const key = String(card.deckId)
      counts[key] = (counts[key] || 0) + 1
    }
  }
  return counts
}

/** Box distribution + due/new totals for the progress page and dashboard. */
export async function boxDistribution(userId: string, lang: string) {
  await connectDB()
  const totalCards = await Card.countDocuments({ languageCode: lang })
  const userCards = await UserCard.find({ userId, languageCode: lang }).select('box dueAt').lean()
  const boxes: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const dueByBox: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const now = new Date()
  let dueNow = 0
  for (const uc of userCards) {
    boxes[uc.box] = (boxes[uc.box] || 0) + 1
    if (new Date(uc.dueAt) <= now) {
      dueNow++
      dueByBox[uc.box] = (dueByBox[uc.box] || 0) + 1
    }
  }
  const seen = userCards.length
  const newCount = Math.max(0, totalCards - seen)
  const mastered = boxes[5]
  dueNow += newCount > NEW_PER_SESSION ? NEW_PER_SESSION : newCount
  return { boxes, dueByBox, seen, newCount, mastered, dueNow, totalCards }
}
