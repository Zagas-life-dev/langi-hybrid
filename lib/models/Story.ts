import mongoose, { Schema, Document, Model } from 'mongoose'
import type { CefrLevel } from './LangiUser'

// An AI-generated graded reader: a short, level-appropriate story in the target
// language with sentence-by-sentence translations, a glossary, and comprehension
// questions. Generated on demand (lib/stories.ts) and saved per learner so each
// builds a personal library — the reading/listening layer the app was missing.
export interface StorySentence { text: string; translation: string }
export interface StoryQuestion { question: string; options: string[]; answer: number }
export interface StoryGloss { term: string; translation: string }

export interface IStory extends Document {
  userId: mongoose.Types.ObjectId
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

const StorySchema = new Schema<IStory>({
  userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
  languageCode: { type: String, required: true, index: true },
  level: { type: String, required: true },
  topic: { type: String, default: '' },
  genre: { type: String, default: '' },
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
  published: { type: Boolean, default: false, index: true },
  publishedAt: { type: Date },
  authorName: { type: String, default: '' },
  hidden: { type: Boolean, default: false },
  reportCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  saveCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
})

// Community-feed query: published, not hidden, by language, ranked by popularity.
StorySchema.index({ languageCode: 1, published: 1, hidden: 1, likeCount: -1, publishedAt: -1 })

if (mongoose.models.Story) mongoose.deleteModel('Story')
const Story: Model<IStory> = mongoose.model<IStory>('Story', StorySchema)
export default Story
