import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ILanguage extends Document {
  code: string          // ISO code, e.g. 'fr'
  name: string          // English name, e.g. 'French'
  nativeName: string    // e.g. 'Français'
  flag: string          // emoji flag
  available: boolean     // whether content exists yet
}

const LanguageSchema = new Schema<ILanguage>({
  code: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  nativeName: { type: String, required: true },
  flag: { type: String, default: '🏳️' },
  available: { type: Boolean, default: false },
})

if (mongoose.models.Language) mongoose.deleteModel('Language')
const Language: Model<ILanguage> = mongoose.model<ILanguage>('Language', LanguageSchema)
export default Language
