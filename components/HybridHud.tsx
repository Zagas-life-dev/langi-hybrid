'use client'
import { Cpu, Cloud } from 'lucide-react'
import { formatBytes, formatUsd, useHud, useLifetime } from '@/lib/hybrid/hud'

// The Hybrid HUD counter: how many AI actions ran on this device (free, private, offline-ready)
// versus in the cloud, and the data and cost the on-device ones saved. Every AI result also wears a
// <HybridBadge />; this is the running total.

/** Sidebar card (desktop). Session numbers up front, lifetime underneath. */
export function HybridHudCard() {
  const s = useHud()
  const life = useLifetime()
  const total = s.onDevice + s.cloud
  const pct = total ? Math.round((s.onDevice / total) * 100) : 0
  return (
    <div className="p-3.5 rounded-[22px] bg-paper border-[2.5px] border-line" aria-label="Hybrid HUD" data-testid="hybrid-hud">
      <p className="meta text-muted flex items-center justify-between">
        <span>Hybrid HUD</span>
        <span>{total ? `${pct}% on-device` : 'this session'}</span>
      </p>
      <div className="mt-2 h-2.5 rounded-full bg-paper-dark overflow-hidden flex" role="img" aria-label={`${s.onDevice} on-device, ${s.cloud} cloud`}>
        <span className="bg-lime h-full" style={{ width: `${total ? pct : 0}%` }} />
        <span className="bg-sky h-full" style={{ width: `${total ? 100 - pct : 0}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-bold">
        <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" strokeWidth={2.4} /> {s.onDevice}</span>
        <span className="flex items-center gap-1"><Cloud className="w-3.5 h-3.5" strokeWidth={2.4} /> {s.cloud}</span>
      </div>
      <p className="meta text-muted mt-1.5" title={`All time on this device: ${life.onDevice} on-device, ${life.cloud} cloud`}>
        Saved {formatBytes(s.savedBytes)} · {formatUsd(s.savedUsd)}
        {life.onDevice + life.cloud > total && (
          <span className="block">All time: {formatBytes(life.savedBytes)} · {formatUsd(life.savedUsd)}</span>
        )}
      </p>
    </div>
  )
}

/** One compact chip for the mobile top bar. Hidden until the first AI action. */
export function HybridHudChip() {
  const s = useHud()
  if (!s.onDevice && !s.cloud) return null
  return (
    <span className="chip bg-lime text-on-bright border-(--shadow-ink)" data-testid="hybrid-hud-chip"
      title={`${s.onDevice} on-device, ${s.cloud} cloud · saved ${formatBytes(s.savedBytes)}`}>
      <Cpu className="w-3.5 h-3.5" strokeWidth={2.4} /> {s.onDevice} · {formatBytes(s.savedBytes)}
    </span>
  )
}
