import mongoose, { Schema, Document, Model, Types } from 'mongoose'
import type { AnswerTolerance } from './Deck'

export interface ICard extends Document {
  deckId: Types.ObjectId
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

const CardSchema = new Schema<ICard>({
  deckId: { type: Schema.Types.ObjectId, ref: 'Deck', required: true, index: true },
  languageCode: { type: String, required: true, index: true },
  term: { type: String, required: true },
  translation: { type: String, required: true },
  partOfSpeech: { type: String },
  gender: { type: String },
  acceptedAnswers: { type: [String], default: [] },
  answerTolerance: { type: String, enum: ['lenient', 'strict'] },
  exampleSentence: { type: String },
  exampleTranslation: { type: String },
  distractors: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  source: {
    type: new Schema({
      kind: { type: String, enum: ['video', 'story', 'chat', 'dictation'] },
      ref: String,
      t: Number,
      context: String,
    }, { _id: false }),
    default: undefined,
  },
  cloze: { type: String },
})
CardSchema.index({ 'source.kind': 1, 'source.ref': 1 }, { sparse: true })

// One card per (deck, term) — the stable key the seeder upserts on.
CardSchema.index({ deckId: 1, term: 1 }, { unique: true })

if (mongoose.models.Card) mongoose.deleteModel('Card')
const Card: Model<ICard> = mongoose.model<ICard>('Card', CardSchema)
export default Card
