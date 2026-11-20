import { defineModel, type Document, type Model } from '@/lib/db/model'

export interface ILanguage extends Document {
  code: string          // ISO code, e.g. 'fr'
  name: string          // English name, e.g. 'French'
  nativeName: string    // e.g. 'Français'
  flag: string          // emoji flag
  available: boolean     // whether content exists yet
}

const Language: Model<ILanguage> = defineModel<ILanguage>({
  collection: 'languages',
  key: ['code'],
  defaults: () => ({ flag: '🏳️', available: false }),
})
export default Language
