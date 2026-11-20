/** Reads the seeded content back through the app's own models. Run: npx tsx --env-file=.env.local scripts/_check-seed.ts */
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import GrammarLesson from '../lib/models/GrammarLesson'
import GrammarQuestion from '../lib/models/GrammarQuestion'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import StoryTemplate from '../lib/models/StoryTemplate'
import Language from '../lib/models/Language'

async function main() {
  const decks = await Deck.find({ languageCode: 'fr', isSystem: true }).sort({ order: 1 }).lean()
  const first = decks[0]
  const cardsInFirst = first ? await Card.find({ deckId: first._id }).lean() : []
  const a1Cards = await Card.countDocuments({ languageCode: 'fr', tags: 'A1' })
  console.log({
    languages: (await Language.find({}).lean()).map((l) => l.code),
    decks: decks.length,
    firstDeck: first?.slug,
    cardsInFirstDeck: cardsInFirst.length,
    sampleCard: cardsInFirst[0] ? `${cardsInFirst[0].term} = ${cardsInFirst[0].translation}` : null,
    totalFrenchCards: await Card.countDocuments({ languageCode: 'fr' }),
    cardsTaggedA1: a1Cards,
    grammarLessons: await GrammarLesson.countDocuments({ languageCode: 'fr' }),
    grammarQuestions: await GrammarQuestion.countDocuments({ languageCode: 'fr' }),
    placementQuestions: await PlacementQuestion.countDocuments({ languageCode: 'fr' }),
    storyTemplates: await StoryTemplate.countDocuments({ languageCode: 'fr' }),
    dueQueryWorks: (await Card.find({ languageCode: 'fr', deckId: { $in: decks.slice(0, 2).map((d) => d._id) } }).limit(5).lean()).length,
  })
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
