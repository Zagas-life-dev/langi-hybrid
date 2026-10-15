import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export interface ILangiUser extends Document {
  supabaseUserId: string
  email: string
  displayName?: string
  // Language the user is learning + their native language (for translations).
  learningLang: string
  nativeLang: string
  // CEFR level — null until the placement test is taken.
  cefrLevel?: CefrLevel | null
  placementTakenAt?: Date
  levelUpAttemptAt?: Date   // last FAILED level-up test (retry cooldown)
  // Friends for the weekly league (other LangiUser ids) + a shareable code.
  friends: Types.ObjectId[]
  friendCode?: string
  // Last weekly progress digest pushed (de-dupe).
  lastDigestAt?: Date
  // Gamification / habit tracking.
  dailyGoal: number          // target card reviews per day
  dailyGoalChosen: boolean    // false until the learner picks a goal (onboarding)
  streak: number
  lastStudyDate?: Date
  xp: number
  // Unlocked achievements (badge id + when it was earned).
  achievements: { id: string; unlockedAt: Date }[]
  // Study reminders (Web Push).
  pushReminders: boolean      // master toggle for the daily nudge
  reminderHour: number        // local hour (0–23) to fire the reminder
  lastReminderAt?: Date       // de-dupe so we never nudge twice a day
  // Preferred TTS voice name (browser SpeechSynthesis voice).
  ttsVoice?: string
  // Age gating for mature content. birthdate set at signup; matureContent is the
  // adult-only opt-in for graphic/intense story generation (auto-off for minors).
  birthdate?: Date | null
  matureContent: boolean
  createdAt: Date
  updatedAt: Date
}

const LangiUserSchema = new Schema<ILangiUser>(
  {
    supabaseUserId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    displayName: { type: String },
    learningLang: { type: String, default: 'fr' },
    nativeLang: { type: String, default: 'en' },
    cefrLevel: { type: String, enum: [...CEFR_LEVELS, null], default: null },
    placementTakenAt: { type: Date },
    levelUpAttemptAt: { type: Date },
    friends: { type: [Schema.Types.ObjectId], ref: 'LangiUser', default: [] },
    friendCode: { type: String, unique: true, sparse: true },
    lastDigestAt: { type: Date },
    dailyGoal: { type: Number, default: 20 },
    dailyGoalChosen: { type: Boolean, default: false },
    streak: { type: Number, default: 0 },
    lastStudyDate: { type: Date },
    xp: { type: Number, default: 0 },
    achievements: {
      type: [new Schema({ id: String, unlockedAt: { type: Date, default: Date.now } }, { _id: false })],
      default: [],
    },
    pushReminders: { type: Boolean, default: true },
    reminderHour: { type: Number, default: 19 },
    lastReminderAt: { type: Date },
    ttsVoice: { type: String },
    birthdate: { type: Date, default: null },
    matureContent: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Next.js dev HMR pins the first-compiled schema on the global mongoose
// singleton; recreating the model guarantees the current schema wins so newly
// added fields aren't silently dropped on save.
if (mongoose.models.LangiUser) {
  mongoose.deleteModel('LangiUser')
}
const LangiUser: Model<ILangiUser> = mongoose.model<ILangiUser>('LangiUser', LangiUserSchema)
export default LangiUser
