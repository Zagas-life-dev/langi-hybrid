import { requireUser } from '@/lib/auth'
import SentenceBuilder from '@/components/SentenceBuilder'

export const dynamic = 'force-dynamic'

export default async function SentencesPage() {
  await requireUser()
  return <SentenceBuilder />
}
