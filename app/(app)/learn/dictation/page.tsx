import { requireUser } from '@/lib/auth'
import DictationSession from '@/components/DictationSession'

export const dynamic = 'force-dynamic'

export default async function DictationPage() {
  await requireUser()
  return <DictationSession />
}
