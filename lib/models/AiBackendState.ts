import mongoose, { Schema, Document, Model } from 'mongoose'

// Persists the AI cascade's per-backend 429 cooldown so the back-off survives a
// server restart and isn't lost between invocations.
export interface IAiBackendState extends Document {
  backend: string
  cooldownUntil?: Date
}

const AiBackendStateSchema = new Schema<IAiBackendState>({
  backend: { type: String, required: true, unique: true, index: true },
  cooldownUntil: { type: Date },
})

if (mongoose.models.AiBackendState) mongoose.deleteModel('AiBackendState')
const AiBackendState: Model<IAiBackendState> =
  mongoose.model<IAiBackendState>('AiBackendState', AiBackendStateSchema)
export default AiBackendState
