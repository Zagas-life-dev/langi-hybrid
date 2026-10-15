// Tiny wrapper over the Vibration API.
//
// Deliberately fire-and-forget: vibration is unsupported on iOS Safari and can
// throw inside cross-origin iframes, and a missing buzz should never break a
// review. Patterns are kept short — long buzzes read as errors to most people.

type Pattern = 'tap' | 'success' | 'error' | 'celebrate'

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  success: 14,
  // Two short pulses: distinguishable from `success` without being punishing.
  error: [18, 55, 18],
  celebrate: [12, 40, 12, 40, 24],
}

export function haptic(pattern: Pattern = 'tap') {
  try {
    // matchMedia guard: users who asked for reduced motion generally don't want
    // the device shaking either.
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate?.(PATTERNS[pattern])
  } catch {
    // Unsupported or blocked — nothing to do.
  }
}
