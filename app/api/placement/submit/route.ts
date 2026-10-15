import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import LangiUser from '@/lib/models/LangiUser'
import PlacementResult from '@/lib/models/PlacementResult'
import { scorePlacement } from '@/lib/placement'

export async function POST(req: NextRequest) {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const answers = Array.isArray(body.answers) ? body.answers : []
  const lang = dbUser.learningLang

  const { level, levelBySkill, scoreByLevel } = await scorePlacement(lang, answers)

  await LangiUser.updateOne(
    { _id: dbUser._id },
    { $set: { cefrLevel: level, placementTakenAt: new Date() } }
  )
  await PlacementResult.create({ userId: dbUser._id, languageCode: lang, level, levelBySkill, scoreByLevel })

  return NextResponse.json({ level, levelBySkill, scoreByLevel })
}
