import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'

// An AI-generated graded reader: a short, level-appropriate story in the target
// language with sentence-by-sentence translations, a glossary, and comprehension
// questions. Generated on demand (lib/stories.ts) and saved per learner so each
// builds a personal library — the reading/listening layer the app was missing.
export interface StorySentence { text: string; translation: string }
export interface StoryQuestion { question: string; options: string[]; answer: number }
export interface StoryGloss { term: string; translation: string }

export interface IStory extends Document {
  userId: string
  languageCode: string
  level: CefrLevel
  topic: string
  genre?: string
  title: string
  titleTranslation: string
  sentences: StorySentence[]
  glossary: StoryGloss[]
  questions: StoryQuestion[]
  // Community publishing (report-only moderation).
  published: boolean
  publishedAt?: Date
  authorName: string
  hidden: boolean          // auto-hidden once reports cross the threshold
  reportCount: number
  likeCount: number        // denormalized for ranking the community feed
  saveCount: number
  createdAt: Date
}

const Story: Model<IStory> = defineModel<IStory>({
  collection: 'stories',
  indexed: ['userId', 'languageCode', 'published'],
  defaults: () => ({ topic: '', genre: '', titleTranslation: '', sentences: [], glossary: [], questions: [], published: false, authorName: '', hidden: false, reportCount: 0, likeCount: 0, saveCount: 0, createdAt: new Date() }),
})
export default Story
