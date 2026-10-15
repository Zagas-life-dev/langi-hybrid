import { NextRequest, NextResponse } from 'next/server'
import { runReminderSweep } from '@/lib/reminders'

// External trigger for the study-reminder sweep. Protect with CRON_SECRET
// (header `x-cron-secret` or `?secret=`). Point any scheduler at this hourly:
//   curl -X POST "http://localhost:3001/api/cron/reminders?secret=$CRON_SECRET"
// Add `&dry=1` to preview who would be reminded without sending.
async function handle(req: NextRequest) {
  const secret =
    req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret')

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const result = await runReminderSweep({ dry })
  return NextResponse.json({ ok: true, dry, ...result })
}

export const GET = handle
export const POST = handle
