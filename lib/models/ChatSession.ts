import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IChatMessage {
  role: 'user' | 'assistant'
  content: string
  corrections?: string
  at: Date
}

export interface IChatSession extends Document {
  userId: Types.ObjectId
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

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    corrections: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const ChatSessionSchema = new Schema<IChatSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'LangiUser', required: true, index: true },
    languageCode: { type: String, required: true },
    mode: { type: String, enum: ['conversation', 'grammar'], default: 'conversation' },
    topic: { type: String },
    scenario: { type: String },
    messages: { type: [ChatMessageSchema], default: [] },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

if (mongoose.models.ChatSession) mongoose.deleteModel('ChatSession')
const ChatSession: Model<IChatSession> = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema)
export default ChatSession
