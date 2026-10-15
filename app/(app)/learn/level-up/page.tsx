import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { nextLevel } from '@/lib/levelUpCore'
import LevelUpTest from '@/components/LevelUpTest'

export const dynamic = 'force-dynamic'

export default async function LevelUpPage() {
  const { dbUser } = await requireUser()
  if (!dbUser.cefrLevel) redirect('/placement')
  const target = nextLevel(dbUser.cefrLevel)
  if (!target) redirect('/learn')
  return <LevelUpTest from={dbUser.cefrLevel} target={target} />
}
