import { requireUser } from '@/lib/auth'
import GrammarPractice from '@/components/GrammarPractice'

export const dynamic = 'force-dynamic'

export default async function GrammarPracticePage() {
  await requireUser()
  return <GrammarPractice />
}
