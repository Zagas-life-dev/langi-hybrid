import { requireUser } from '@/lib/auth'
import PlacementTest from '@/components/PlacementTest'

export const dynamic = 'force-dynamic'

export default async function PlacementPage() {
  const { dbUser } = await requireUser()
  return <PlacementTest currentLevel={dbUser.cefrLevel} />
}
