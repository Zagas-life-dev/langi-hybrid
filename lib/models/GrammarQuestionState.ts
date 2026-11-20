import { defineModel, type Document, type Model } from '@/lib/db/model'

// Per-(learner, grammar question) Leitner SRS state — mirrors UserCard, so
// grammar concept questions are spaced and reviewed just like vocab. Questions
// with no state yet are "new" and introduced into practice up to a session cap.
export interface IGrammarQuestionState extends Document {
  userId: string
  questionId: string
  languageCode: string
  box: number
  dueAt: Date
  lastReviewedAt?: Date
  correctStreak: number
  lapses: number
  reps: number
}

const GrammarQuestionState: Model<IGrammarQuestionState> = defineModel<IGrammarQuestionState>({
  collection: 'grammarQuestionStates',
  key: ['userId', 'questionId'],
  indexed: ['userId', 'languageCode'],
  defaults: () => ({ box: 1, dueAt: new Date(), correctStreak: 0, lapses: 0, reps: 0 }),
})
export default GrammarQuestionState
