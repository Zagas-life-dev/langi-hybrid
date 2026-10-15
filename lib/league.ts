import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import LangiUser, { type ILangiUser } from '@/lib/models/LangiUser'
import DailyActivity from '@/lib/models/DailyActivity'
import { weekDateKeys } from '@/lib/weekly'
import { rankRows, publicName, makeFriendCode, type RankedRow } from '@/lib/leagueCore'

export * from '@/lib/leagueCore'

// Weekly league: XP earned Monday→Sunday, ranked among everyone learning the
// same language ('league') or among the learner and their friends ('friends').

export type LeagueScope = 'league' | 'friends'
const BOARD_SIZE = 30

export async function weeklyBoard(me: ILangiUser, scope: LeagueScope): Promise<{ rows: RankedRow[]; me: RankedRow | null; week: string[] }> {
  await connectDB()
  const week = weekDateKeys(new Date())
  const myId = String(me._id)

  let userFilter: Types.ObjectId[] | null = null
  if (scope === 'friends') userFilter = [me._id as Types.ObjectId, ...(me.friends || [])]

  const totals = await DailyActivity.aggregate<{ _id: Types.ObjectId; xp: number }>([
    { $match: { date: { $in: week }, xp: { $gt: 0 }, ...(userFilter ? { userId: { $in: userFilter } } : {}) } },
    { $group: { _id: '$userId', xp: { $sum: '$xp' } } },
  ])
  const xpById = new Map(totals.map((t) => [String(t._id), t.xp]))

  // League = same target language. Friends show even with 0 XP this week.
  const users = await LangiUser.find(
    scope === 'friends'
      ? { _id: { $in: userFilter ?? [] } }
      : { _id: { $in: totals.map((t) => t._id) }, learningLang: me.learningLang }
  ).select('displayName').lean()

  const rows = rankRows(
    users.map((u) => ({
      userId: String(u._id),
      name: publicName(u.displayName, String(u._id)),
      xp: xpById.get(String(u._id)) || 0,
      isMe: String(u._id) === myId,
    }))
  )
  const mine = rows.find((r) => r.isMe) ?? null
  const top = rows.slice(0, BOARD_SIZE)
  // Always show the learner's own row, even outside the top of the board.
  if (mine && !top.includes(mine)) top.push(mine)
  return { rows: top, me: mine, week }
}

/** The learner's friend code, minted on first use (retries on a rare collision). */
export async function ensureFriendCode(me: ILangiUser): Promise<string> {
  if (me.friendCode) return me.friendCode
  await connectDB()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeFriendCode()
    try {
      const res = await LangiUser.updateOne({ _id: me._id, friendCode: { $exists: false } }, { $set: { friendCode: code } })
      if (res.modifiedCount) return code
      const fresh = await LangiUser.findById(me._id).select('friendCode').lean()
      if (fresh?.friendCode) return fresh.friendCode
    } catch {
      // Duplicate key — another user already has this code; try another.
    }
  }
  throw new Error('Could not create a friend code')
}

/** Mutual friendship by code. Returns the friend's public name. */
export async function addFriendByCode(me: ILangiUser, code: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  await connectDB()
  const friend = await LangiUser.findOne({ friendCode: code }).select('_id displayName').lean()
  if (!friend) return { ok: false, error: 'No learner has that code.' }
  if (String(friend._id) === String(me._id)) return { ok: false, error: 'That’s your own code!' }
  await Promise.all([
    LangiUser.updateOne({ _id: me._id }, { $addToSet: { friends: friend._id } }),
    LangiUser.updateOne({ _id: friend._id }, { $addToSet: { friends: me._id } }),
  ])
  return { ok: true, name: publicName(friend.displayName, String(friend._id)) }
}

export async function removeFriend(me: ILangiUser, friendId: string): Promise<void> {
  if (!Types.ObjectId.isValid(friendId)) return
  await connectDB()
  const fid = new Types.ObjectId(friendId)
  await Promise.all([
    LangiUser.updateOne({ _id: me._id }, { $pull: { friends: fid } }),
    LangiUser.updateOne({ _id: fid }, { $pull: { friends: me._id } }),
  ])
}
