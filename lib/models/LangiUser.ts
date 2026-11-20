import { defineModel, type Document, type Model } from '@/lib/db/model'

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
  friends: string[]
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

const LangiUser: Model<ILangiUser> = defineModel<ILangiUser>({
  collection: 'users',
  timestamps: true,
  key: ['supabaseUserId'],
  indexed: ['friendCode'],
  defaults: () => ({ learningLang: 'fr', nativeLang: 'en', cefrLevel: null, friends: [], dailyGoal: 20, dailyGoalChosen: false, streak: 0, xp: 0, achievements: [], pushReminders: true, reminderHour: 19, birthdate: null, matureContent: false }),
})
export default LangiUser
