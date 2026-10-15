import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import Mistake, { type MistakeSource, type IMistake } from '@/lib/models/Mistake'

export interface RecordMistakeInput {
  source: MistakeSource
  prompt: string      // front context (English to translate / the sentence you wrote)
  answer: string      // the correct target-language text to recall
  userAnswer?: string // your original attempt (shown on reveal)
  note?: string       // short English explanation
}

/**
 * Auto-file (or refresh) a mistake for SRS re-practice. Deduped on
 * (user, source, prompt) among *unresolved* items so re-missing the same thing
 * just resets it to box 1 rather than piling up duplicates.
 */
export async function recordMistake(
  userId: Types.ObjectId | string,
  languageCode: string,
  m: RecordMistakeInput
): Promise<void> {
  const prompt = (m.prompt || '').trim()
  const answer = (m.answer || '').trim()
  if (!prompt || !answer) return // nothing meaningful to recall

  await connectDB()
  const now = new Date()
  await Mistake.findOneAndUpdate(
    { userId, source: m.source, prompt, resolved: false },
    {
      $set: {
        languageCode,
        answer,
        userAnswer: (m.userAnswer || '').trim(),
        note: (m.note || '').trim(),
        box: 1,
        dueAt: now,
      },
      $setOnInsert: {
        userId,
        source: m.source,
        prompt,
        correctStreak: 0,
        lapses: 0,
        reps: 0,
      },
    },
    { upsert: true }
  ).catch((e) => console.error('recordMistake failed:', e))
}

/** Due, unresolved mistakes for the deck (oldest-due first). */
export async function getDueMistakes(
  userId: Types.ObjectId | string,
  lang: string,
  limit = 20
): Promise<IMistake[]> {
  await connectDB()
  return Mistake.find({
    userId,
    languageCode: lang,
    resolved: false,
    dueAt: { $lte: new Date() },
  })
    .sort({ dueAt: 1 })
    .limit(limit)
    .lean<IMistake[]>()
}

/** Count of due, unresolved mistakes. */
export async function countDueMistakes(userId: Types.ObjectId | string, lang: string): Promise<number> {
  await connectDB()
  return Mistake.countDocuments({ userId, languageCode: lang, resolved: false, dueAt: { $lte: new Date() } })
}

/**
 * Short "focus points" distilled from the learner's most recent unresolved
 * mistakes, for steering AI practice (tutor chat, sentence prompts) toward what
 * they actually get wrong. Cheap: one indexed query, no AI.
 */
export async function recentMistakeFocus(
  userId: Types.ObjectId | string,
  lang: string,
  limit = 4
): Promise<string[]> {
  await connectDB()
  const rows = await Mistake.find({ userId, languageCode: lang, resolved: false })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('note answer')
    .lean<Pick<IMistake, 'note' | 'answer'>[]>()
  return rows
    .map((m) => {
      const note = (m.note || '').trim().slice(0, 140)
      const answer = (m.answer || '').trim().slice(0, 80)
      return note ? `${note} (correct form: "${answer}")` : `"${answer}"`
    })
    .filter(Boolean)
}
