import { defineModel, type Document, type Model } from '@/lib/db/model'

export interface ISentenceAttempt extends Document {
  userId: string
  languageCode: string
  prompt: string          // the English sentence to translate
  userSentence: string
  correction: string
  feedback: string
  score: number
  at: Date
}

const SentenceAttempt: Model<ISentenceAttempt> = defineModel<ISentenceAttempt>({
  collection: 'sentenceAttempts',
  indexed: ['userId'],
  defaults: () => ({ correction: '', feedback: '', score: 0, at: new Date() }),
})
export default SentenceAttempt
