import { defineModel, type Document, type Model } from '@/lib/db/model'

// Tracks a learner's completion of a grammar mini-lesson's drill set. One doc
// per (learner, lesson). `bestScore` is the highest drill accuracy (0–100).
export interface IGrammarProgress extends Document {
  userId: string
  lessonSlug: string
  languageCode: string
  completed: boolean
  bestScore: number
  attempts: number
  lastAttemptAt: Date
  createdAt: Date
  updatedAt: Date
}

const GrammarProgress: Model<IGrammarProgress> = defineModel<IGrammarProgress>({
  collection: 'grammarProgress',
  timestamps: true,
  key: ['userId', 'lessonSlug'],
  indexed: ['userId'],
  defaults: () => ({ completed: false, bestScore: 0, attempts: 0, lastAttemptAt: new Date() }),
})
export default GrammarProgress
