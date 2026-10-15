import { requireUser } from '@/lib/auth'
import { langName } from '@/lib/langs'
import LeagueBoard from '@/components/LeagueBoard'

export const dynamic = 'force-dynamic'

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { dbUser } = await requireUser()
  const { scope } = await searchParams
  return <LeagueBoard initialScope={scope === 'friends' ? 'friends' : 'league'} langName={langName(dbUser.learningLang)} />
}
