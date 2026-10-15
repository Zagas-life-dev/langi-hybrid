import type { ILangiUser } from '@/lib/models/LangiUser'
import { recordActivity, type ActivityKind } from '@/lib/activity'

/**
 * Back-compat thin wrapper around {@link recordActivity}: record a study action
 * for the day (advance streak + XP, roll up daily activity) and return the new
 * streak. New code should call recordActivity directly to get goal/achievement
 * results too.
 */
export async function recordStudy(
  dbUser: ILangiUser,
  opts: { xp?: number; kind?: ActivityKind } = {}
): Promise<number> {
  const { streak } = await recordActivity(dbUser, { kind: opts.kind ?? 'video', xp: opts.xp ?? 0 })
  return streak
}
