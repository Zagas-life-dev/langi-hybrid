import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { AnswerTolerance } from './Deck'

export interface ICard extends Document {
  deckId: string
  languageCode: string
  term: string              // the foreign-language prompt, e.g. 'bonjour'
  translation: string       // the native answer, e.g. 'hello'
  partOfSpeech?: string     // noun, verb, adj, phrase…
  gender?: string           // m | f | mf (for nouns)
  // Extra answers accepted as correct (synonyms / alt phrasings).
  acceptedAnswers: string[]
  // Optional per-card override of the deck's tolerance.
  answerTolerance?: AnswerTolerance
  // AI-enriched, cached lazily.
  exampleSentence?: string
  exampleTranslation?: string
  distractors: string[]     // wrong options for multiple-choice mode
  tags: string[]
  // Where a saved word was found (Saved-words deck only), so the learner can
  // jump back to the moment — e.g. a video at 1:42 or the story sentence.
  source?: CardSource
  // Sentence card mined from a video line: `term` is the whole sentence and
  // `cloze` the word blanked out of it — the learner types that word back.
  cloze?: string
}

export interface CardSource {
  kind: 'video' | 'story' | 'chat' | 'dictation'
  ref?: string      // videoId / story id
  t?: number        // seconds into the video
  context?: string  // the sentence the word appeared in
}

const Card: Model<ICard> = defineModel<ICard>({
  collection: 'cards',
  cacheMs: 60 * 60 * 1000, // static content: cached in memory for an hour, only affected entries dropped on a write
  key: ['deckId', 'term'],
  indexed: ['deckId', 'languageCode'],
  defaults: () => ({ acceptedAnswers: [], distractors: [], tags: [] }),
})
export default Card
