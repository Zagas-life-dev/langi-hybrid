// Achievement catalog + evaluation. Badges are unlocked from cheap signals we
// already have on the user doc plus a couple of indexed counts, so the check can
// run inline on every study action without ballooning query load.

export interface AchievementStats {
  streak: number
  xp: number
  totalReviews: number
  mastered: number
  goalMetDays: number
  sentences: number
  grammarLessons: number
  mistakesResolved: number
}

export interface AchievementDef {
  id: string
  title: string
  description: string
  icon: string // emoji — cheap, renders everywhere
  // True once earned. Receives the full stats snapshot.
  test: (s: AchievementStats) => boolean
}

// Ordered roughly by how soon a learner is likely to hit them.
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-steps', title: 'First steps', description: 'Complete your first review', icon: '🌱', test: (s) => s.totalReviews >= 1 },
  { id: 'getting-started', title: 'Getting started', description: 'Review 50 cards', icon: '📚', test: (s) => s.totalReviews >= 50 },
  { id: 'centurion', title: 'Centurion', description: 'Review 500 cards', icon: '💯', test: (s) => s.totalReviews >= 500 },
  { id: 'scholar', title: 'Scholar', description: 'Review 2,000 cards', icon: '🎓', test: (s) => s.totalReviews >= 2000 },

  { id: 'streak-3', title: 'On a roll', description: 'Reach a 3-day streak', icon: '🔥', test: (s) => s.streak >= 3 },
  { id: 'streak-7', title: 'Habit forming', description: 'Reach a 7-day streak', icon: '⚡', test: (s) => s.streak >= 7 },
  { id: 'streak-30', title: 'Unstoppable', description: 'Reach a 30-day streak', icon: '🌟', test: (s) => s.streak >= 30 },
  { id: 'streak-100', title: 'Centenarian', description: 'Reach a 100-day streak', icon: '👑', test: (s) => s.streak >= 100 },

  { id: 'goal-7', title: 'Goal getter', description: 'Hit your daily goal 7 times', icon: '🎯', test: (s) => s.goalMetDays >= 7 },
  { id: 'goal-30', title: 'Dedicated', description: 'Hit your daily goal 30 times', icon: '🏆', test: (s) => s.goalMetDays >= 30 },

  { id: 'mastered-25', title: 'Word collector', description: 'Master 25 words', icon: '🗂️', test: (s) => s.mastered >= 25 },
  { id: 'mastered-100', title: 'Lexicon', description: 'Master 100 words', icon: '📖', test: (s) => s.mastered >= 100 },

  { id: 'xp-1000', title: 'Rising star', description: 'Earn 1,000 XP', icon: '✨', test: (s) => s.xp >= 1000 },
  { id: 'xp-10000', title: 'Polyglot path', description: 'Earn 10,000 XP', icon: '💫', test: (s) => s.xp >= 10000 },

  { id: 'writer', title: 'Wordsmith', description: 'Write 20 sentences', icon: '✍️', test: (s) => s.sentences >= 20 },
  { id: 'grammar-5', title: 'Grammar geek', description: 'Finish 5 grammar lessons', icon: '🧠', test: (s) => s.grammarLessons >= 5 },
  { id: 'mistakes-25', title: 'Fix it', description: 'Clear 25 mistakes from your deck', icon: '🛠️', test: (s) => s.mistakesResolved >= 25 },
]

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
export function achievementById(id: string): AchievementDef | undefined {
  return BY_ID.get(id)
}

// Given current stats and the set already unlocked, return newly-earned defs.
export function newlyUnlocked(stats: AchievementStats, unlockedIds: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id) && a.test(stats))
}
