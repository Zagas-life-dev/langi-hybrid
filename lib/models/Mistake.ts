import { defineModel, type Document, type Model } from '@/lib/db/model'

export type MistakeSource = 'sentence' | 'chat' | 'review' | 'grammar'

// A personalised SRS item auto-generated from something the learner got wrong:
// a low-scoring sentence translation, a tutor correction in chat, or a missed
// grammar drill. Reviewed in the Mistakes deck (self-graded recall) and retired
// once it graduates to the top box.
export interface IMistake extends Document {
  userId: string
  languageCode: string
  source: MistakeSource
  prompt: string        // front context, e.g. the English to translate / your sentence
  answer: string        // the correct target-language text to recall
  userAnswer: string    // what the learner originally wrote (shown on reveal)
  note: string          // short English explanation of the fix
  // Leitner SRS state (reuses lib/srs-core grade()).
  box: number
  dueAt: Date
  correctStreak: number
  lapses: number
  reps: number
  lastReviewedAt?: Date
  resolved: boolean     // graduated out of active review (box 5)
  createdAt: Date
  updatedAt: Date
}

const Mistake: Model<IMistake> = defineModel<IMistake>({
  collection: 'mistakes',
  timestamps: true,
  indexed: ['userId', 'languageCode', 'resolved'],
  defaults: () => ({ userAnswer: '', note: '', box: 1, dueAt: new Date(), correctStreak: 0, lapses: 0, reps: 0, resolved: false }),
})
export default Mistake
