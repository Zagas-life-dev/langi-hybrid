import { defineModel, type Document, type Model } from '@/lib/db/model'

// Persists the AI cascade's per-backend 429 cooldown so the back-off survives a
// server restart and isn't lost between invocations.
export interface IAiBackendState extends Document {
  backend: string
  cooldownUntil?: Date
}

const AiBackendState: Model<IAiBackendState> = defineModel<IAiBackendState>({
  collection: 'aiBackendStates',
  key: ['backend'],
})
export default AiBackendState
