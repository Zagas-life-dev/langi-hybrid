import { defineModel, type Document, type Model } from '@/lib/db/model'

export interface IChatMessage {
  role: 'user' | 'assistant'
  content: string
  corrections?: string
  at: Date
}

export interface IChatSession extends Document {
  userId: string
  languageCode: string
  mode: 'conversation' | 'grammar'
  topic?: string
  scenario?: string // role-play scenario key (e.g. 'cafe'), when set
  messages: IChatMessage[]
  messageCount: number
  createdAt: Date
  updatedAt: Date
}

// Keep persisted history bounded — long embedded arrays bloat the doc and make
// reads expensive. We retain the most recent MESSAGE_CAP entries.
export const MESSAGE_CAP = 50

const ChatSession: Model<IChatSession> = defineModel<IChatSession>({
  collection: 'chatSessions',
  timestamps: true,
  indexed: ['userId', 'languageCode'],
  defaults: () => ({ mode: 'conversation', messages: [], messageCount: 0 }),
})
export default ChatSession
