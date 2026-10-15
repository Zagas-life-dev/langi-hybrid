'use client'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, type ThemeChoice } from '@/components/ThemeProvider'

/**
 * Compact icon button that flips light/dark. Used in the app header where
 * there's no room for the full three-way control.
 */
export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={toggle}
      className={`circle-arrow w-11 h-11 hover:bg-paper-dark ${className}`}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {resolved === 'dark'
        ? <Sun className="w-[18px] h-[18px]" strokeWidth={2.4} />
        : <Moon className="w-[18px] h-[18px]" strokeWidth={2.4} />}
    </button>
  )
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/**
 * Full three-way picker (Light / Dark / System) for the settings page — the
 * only place that exposes 'system' as an explicit choice.
 */
export function ThemeSegmented() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`border-[2.5px] rounded-[22px] p-4 flex flex-col items-center gap-2 transition-colors ${
              active ? 'border-[var(--shadow-ink)] bg-purple text-on-purple shadow-(--shadow-sm)' : 'border-line bg-paper-raised hover:bg-paper-dark'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={2.2} />
            <span className="meta">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
