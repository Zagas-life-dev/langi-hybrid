import { requireUser } from '@/lib/auth'
import StoriesBrowser from '@/components/StoriesBrowser'

export const dynamic = 'force-dynamic'

export default async function StoriesPage() {
  await requireUser()
  return <StoriesBrowser />
}
