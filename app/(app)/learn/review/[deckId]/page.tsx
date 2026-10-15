import { requireUser } from '@/lib/auth'
import Deck from '@/lib/models/Deck'
import ReviewSession from '@/components/ReviewSession'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params
  await requireUser()
  let title = 'All due cards'
  if (deckId !== 'all') {
    const deck = await Deck.findById(deckId).lean()
    title = deck?.title ?? 'Review'
  }
  return <ReviewSession deckId={deckId} title={title} />
}
