import type { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import Deck from '@/lib/models/Deck'
import Card from '@/lib/models/Card'
import UserCard from '@/lib/models/UserCard'
import type { CardSource } from '@/lib/models/Card'
import type { ILangiUser } from '@/lib/models/LangiUser'

export interface SavedVocab {
  term: string
  translation: string
  gender?: string
  alreadySaved: boolean
}

/**
 * Add a word to the learner's personal "Saved words" deck as a due SRS card.
 * Shared by the video save-word flow and the chat tutor (words the learner asks
 * about). Idempotent: re-saving the same term updates it rather than duplicating,
 * and it's only scheduled for review once. The translation is provided by the
 * caller (no AI call here), so it's cheap and reusable.
 */
export async function saveVocab(
  dbUser: ILangiUser,
  lang: string,
  term: string,
  translation: string,
  extra: { partOfSpeech?: string; gender?: string; level?: string; source?: CardSource } = {}
): Promise<SavedVocab | null> {
  const cleanTerm = term.trim()
  const cleanTranslation = translation.trim()
  if (!cleanTerm || !cleanTranslation || cleanTerm.length > 80) return null

  const deck = await savedDeck(dbUser, lang)

  const card = await Card.findOneAndUpdate(
    { deckId: deck!._id, term: cleanTerm },
    {
      $set: {
        translation: cleanTranslation,
        partOfSpeech: extra.partOfSpeech,
        gender: extra.gender,
        // Latest sighting wins, so "jump back to where I saw it" is the freshest.
        ...(extra.source ? { source: extra.source } : {}),
      },
      $setOnInsert: {
        deckId: deck!._id,
        languageCode: lang,
        term: cleanTerm,
        // The sentence the word was found in doubles as its first example.
        ...(extra.source?.context ? { exampleSentence: extra.source.context.slice(0, 300) } : {}),
      },
      // Tag the card with its CEFR level so saved words can be filtered by level.
      ...(extra.level ? { $addToSet: { tags: extra.level } } : {}),
    },
    { upsert: true, returnDocument: 'after' }
  )

  const existing = await scheduleOnce(dbUser, lang, card!._id)

  return { term: cleanTerm, translation: cleanTranslation, gender: extra.gender, alreadySaved: Boolean(existing) }
}

/** The learner's personal "Saved words" deck for `lang` (created on first save). */
async function savedDeck(dbUser: ILangiUser, lang: string) {
  await connectDB()
  const slug = `saved-${String(dbUser._id)}-${lang}`
  const deck = await Deck.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        slug,
        languageCode: lang,
        title: 'Saved words',
        description: 'Words you saved from videos, stories and chats.',
        level: dbUser.cefrLevel || 'A1',
        topic: 'saved',
        order: 999,
        isSystem: false,
        answerTolerance: 'lenient',
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
  return deck!
}

/** Put a card in the learner's review queue unless it's already there; true if it was. */
async function scheduleOnce(dbUser: ILangiUser, lang: string, cardId: Types.ObjectId): Promise<boolean> {
  const existing = await UserCard.findOne({ userId: dbUser._id, cardId })
  if (!existing) {
    await UserCard.create({ userId: dbUser._id, cardId, languageCode: lang, box: 1, dueAt: new Date() })
  }
  return Boolean(existing)
}

export interface SavedSentence { sentence: string; cloze: string; alreadySaved: boolean }

/**
 * Save a whole subtitle line as a fill-in-the-blank card in "Saved words":
 * `sentence` with `word` blanked; the hint is the line in the learner's own
 * language when the caller has it (`meaning`), else the word's gloss. No AI.
 */
export async function saveSentence(
  dbUser: ILangiUser,
  lang: string,
  sentence: string,
  word: string,
  meaning: string,
  source?: CardSource
): Promise<SavedSentence | null> {
  const cleanSentence = sentence.replace(/\s+/g, ' ').trim()
  const cloze = word.trim()
  const hint = meaning.trim()
  if (!cleanSentence || !cloze || !hint || cleanSentence.length > 300 || cloze.length > 80) return null

  const deck = await savedDeck(dbUser, lang)
  const card = await Card.findOneAndUpdate(
    { deckId: deck._id, term: cleanSentence },
    {
      $set: { translation: hint.slice(0, 300), cloze, partOfSpeech: 'sentence', ...(source ? { source } : {}) },
      $setOnInsert: { deckId: deck._id, languageCode: lang, term: cleanSentence },
      $addToSet: { tags: 'sentence' },
    },
    { upsert: true, returnDocument: 'after' }
  )
  const alreadySaved = await scheduleOnce(dbUser, lang, card!._id)
  return { sentence: cleanSentence, cloze, alreadySaved }
}
