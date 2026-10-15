import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getPlacementForm } from '@/lib/placement'

export async function GET() {
  let dbUser
  try {
    ({ dbUser } = await requireUser())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const questions = await getPlacementForm(dbUser.learningLang)
  return NextResponse.json({ questions })
}
