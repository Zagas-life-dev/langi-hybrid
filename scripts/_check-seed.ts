/** Reads the seeded content back through the app's own models. Run: npx tsx --env-file=.env.local scripts/_check-seed.ts [lang ...] */
import Deck from '../lib/models/Deck'
import Card from '../lib/models/Card'
import GrammarLesson from '../lib/models/GrammarLesson'
import GrammarQuestion from '../lib/models/GrammarQuestion'
import PlacementQuestion from '../lib/models/PlacementQuestion'
import StoryTemplate from '../lib/models/StoryTemplate'
import Language from '../lib/models/Language'
import { getPlacementForm } from '../lib/placement'

async function main() {
  const langs = process.argv.slice(2)
  const targets = langs.length ? langs : ['fr']
  console.log('languages registered:', (await Language.find({}).lean()).map((l) => `${l.code}${l.available ? '' : '(off)'}`).join(' '))
  for (const lang of targets) {
    const decks = await Deck.find({ languageCode: lang, isSystem: true }).sort({ order: 1 }).lean()
    const first = decks[0]
    const cardsInFirst = first ? await Card.find({ deckId: first._id }).lean() : []
    const form = await getPlacementForm(lang)
    const byLevel = decks.reduce<Record<string, number>>((m, d) => ((m[d.level] = (m[d.level] || 0) + 1), m), {})
    console.log(`\n[${lang}]`, {
      decks: decks.length,
      decksByLevel: byLevel,
      firstDeck: first?.slug,
      cardsInFirstDeck: cardsInFirst.length,
      sampleCard: cardsInFirst[0] ? `${cardsInFirst[0].term}  =  ${cardsInFirst[0].translation}` : null,
      totalCards: await Card.countDocuments({ languageCode: lang }),
      placementQuestionsInBank: await PlacementQuestion.countDocuments({ languageCode: lang }),
      placementFormSize: form.length,
      grammarLessons: await GrammarLesson.countDocuments({ languageCode: lang }),
      grammarQuestions: await GrammarQuestion.countDocuments({ languageCode: lang }),
      storyTemplates: await StoryTemplate.countDocuments({ languageCode: lang }),
    })
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
