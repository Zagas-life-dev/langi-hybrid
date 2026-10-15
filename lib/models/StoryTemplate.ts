import mongoose, { Schema, Document, Model } from 'mongoose'
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

const StoryTemplateSchema = new Schema<IStoryTemplate>({
  slug: { type: String, required: true, unique: true, index: true },
  languageCode: { type: String, required: true, index: true },
  level: { type: String, required: true, index: true },
  topic: { type: String, default: '' },
  title: { type: String, required: true },
  titleTranslation: { type: String, default: '' },
  sentences: {
    type: [new Schema<StorySentence>({ text: String, translation: String }, { _id: false })],
    default: [],
  },
  glossary: {
    type: [new Schema<StoryGloss>({ term: String, translation: String }, { _id: false })],
    default: [],
  },
  questions: {
    type: [new Schema<StoryQuestion>({ question: String, options: [String], answer: Number }, { _id: false })],
    default: [],
  },
  order: { type: Number, default: 0 },
})

if (mongoose.models.StoryTemplate) mongoose.deleteModel('StoryTemplate')
const StoryTemplate: Model<IStoryTemplate> = mongoose.model<IStoryTemplate>('StoryTemplate', StoryTemplateSchema)
export default StoryTemplate
