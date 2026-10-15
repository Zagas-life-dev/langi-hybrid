import { requireUser } from '@/lib/auth'
import MistakeReview from '@/components/MistakeReview'

export const dynamic = 'force-dynamic'

export default async function MistakesPage() {
  await requireUser()
  return <MistakeReview />
}
