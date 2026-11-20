'use client'
// The one badge every AI result wears: where it ran (on-device or cloud), how long it took,
// and on hover why that route was chosen. Part of the Hybrid HUD.
export type HybridBadgeInfo = { source: 'ON_DEVICE' | 'IN_CLOUD'; ms: number; reason?: string }

export default function HybridBadge({ source, ms, reason }: HybridBadgeInfo) {
  const local = source === 'ON_DEVICE'
  return (
    <span title={reason} data-testid="hybrid-badge" data-source={source}
      className={`chip border-(--shadow-ink) text-on-bright ${local ? 'bg-lime' : 'bg-sky'}`}>
      {local ? 'On-device' : 'Cloud'} · {ms} ms
    </span>
  )
}
