import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { recentMistakeFocus } from '@/lib/mistakes'

// GET → what the browser needs to write a practice sentence: level, language, weak spots.
// The sentence itself is generated in the browser (Firebase AI Logic).
export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await connectDB()
  const focus = await recentMistakeFocus(dbUser._id, dbUser.learningLang)
  return NextResponse.json({ level: dbUser.cefrLevel || 'A2', lang: dbUser.learningLang, focus })
}
