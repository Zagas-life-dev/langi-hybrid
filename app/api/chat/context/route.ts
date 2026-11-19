import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { recentMistakeFocus } from '@/lib/mistakes'

// GET → what the browser needs to build a tutor prompt on-device: the learner's level,
// target language and recent weak spots. AI itself runs in the browser (Firebase AI Logic).
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const lang = dbUser.learningLang
  const focus = await recentMistakeFocus(dbUser._id, lang, 3)
  return NextResponse.json({ level: dbUser.cefrLevel || 'A2', lang, focus })
}
