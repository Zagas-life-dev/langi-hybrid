import { defineModel, type Document, type Model } from '@/lib/db/model'
import type { CefrLevel } from './LangiUser'
import type { StorySentence, StoryQuestion, StoryGloss } from './Story'

// A CURATED graded reader (vs. the AI-generated, per-user `Story`). Seeded by
// slug from data/<lang>/stories/*.json. The Stories page suggests these by the
// learner's CEFR level FIRST, and only falls back to AI generation when the
// learner wants a custom topic or has read them all. Shared across all users.
export interface IStoryTemplate extends Document {
  slug: string
  languageCode: string
  level: CefrLevel
  topic: string
  title: string
  titleTranslation: string
  sentences: StorySentence[]
  glossary: StoryGloss[]
  questions: StoryQuestion[]
  order: number
}

const StoryTemplate: Model<IStoryTemplate> = defineModel<IStoryTemplate>({
  collection: 'storyTemplates',
  cacheMs: 10 * 60 * 1000, // static content: cached in memory, cleared on any write
  key: ['slug'],
  indexed: ['languageCode', 'level'],
  defaults: () => ({ topic: '', titleTranslation: '', sentences: [], glossary: [], questions: [], order: 0 }),
})
export default StoryTemplate
