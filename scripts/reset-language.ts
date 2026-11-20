/**
 * Remove ONE language's built-in content (system decks, their cards, placement questions) from Firestore so it
 * can be re-seeded cleanly. Learners' own data is never touched: saved-word cards live in their personal
 * decks (isSystem = false), and review progress is only removed for the cards that are deleted here.
 *
 *     npx tsx --env-file=.env.local scripts/reset-language.ts yo
 */
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import UserCard from '../lib/models/UserCard'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import { resolveLang } from './_lang'

async function main() {
  const { lang } = resolveLang()
  console.log('Resetting built-in content for', lang, 'in Firestore project', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)

  const decks = await Deck.find({ languageCode: lang, isSystem: true }).lean()
  const deckIds = decks.map((d) => d._id)
  const cards = deckIds.length ? await Card.find({ deckId: { $in: deckIds } }).select('_id').lean() : []
  const cardIds = cards.map((c) => c._id)

  const progress = cardIds.length ? await UserCard.deleteMany({ cardId: { $in: cardIds } }) : { deletedCount: 0 }
  const cardRes = deckIds.length ? await Card.deleteMany({ deckId: { $in: deckIds } }) : { deletedCount: 0 }
  const deckRes = await Deck.deleteMany({ languageCode: lang, isSystem: true })
  const placeRes = await PlacementQuestion.deleteMany({ languageCode: lang })
  console.log(`${lang}: removed ${deckRes.deletedCount} decks, ${cardRes.deletedCount} cards, ${progress.deletedCount} progress rows, ${placeRes.deletedCount} placement questions`)
}

main().catch((e) => {
  console.error('Reset failed:', e)
  process.exit(1)
})
