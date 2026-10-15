// Langi the tutor: a speech bubble with two eyes, a smile and pink cheeks.
// Drawn from the design system's mascot assets. `purple` is for cream and white
// grounds; `yellow` is for purple grounds. `mark` is the heavier-outlined logo
// version that holds up at 32 to 40px. Never recolour it beyond these.

const BUBBLE = 'M20 8 H100 A16 16 0 0 1 116 24 V66 A16 16 0 0 1 100 82 H52 L30 102 L34 82 H20 A16 16 0 0 1 4 66 V24 A16 16 0 0 1 20 8 Z'

export default function Mascot({
  variant = 'purple',
  size = 120,
  className = '',
  title,
}: {
  variant?: 'purple' | 'yellow' | 'mark'
  size?: number
  className?: string
  /** Pass a title to expose it to screen readers; otherwise it's decorative. */
  title?: string
}) {
  const yellow = variant === 'yellow'
  const mark = variant === 'mark'
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true }

  return (
    <svg
      width={size}
      height={(size * 110) / 120}
      viewBox="0 0 120 110"
      className={className}
      {...a11y}
    >
      <path
        d={BUBBLE}
        fill={yellow ? '#FFD84A' : '#6B3CF6'}
        stroke="#1B1530"
        strokeWidth={mark ? 6 : 3}
        strokeLinejoin="round"
      />
      <ellipse cx="44" cy="40" rx={mark ? 10 : 9} ry={mark ? 13 : 12} fill="#FFFFFF"
        {...(yellow ? { stroke: '#1B1530', strokeWidth: 2 } : {})} />
      <ellipse cx="76" cy="40" rx={mark ? 10 : 9} ry={mark ? 13 : 12} fill="#FFFFFF"
        {...(yellow ? { stroke: '#1B1530', strokeWidth: 2 } : {})} />
      <circle cx="46" cy={mark ? 44 : 43} r={mark ? 5.5 : 5} fill="#1B1530" />
      <circle cx="78" cy={mark ? 44 : 43} r={mark ? 5.5 : 5} fill="#1B1530" />
      <path
        d="M48 62 Q60 72 72 62"
        fill="none"
        stroke={yellow ? '#1B1530' : '#FFFFFF'}
        strokeWidth={mark ? 5 : 4}
        strokeLinecap="round"
      />
      {!mark && (
        <>
          <circle cx="30" cy="58" r="6" fill="#FFA6CF" />
          <circle cx="90" cy="58" r="6" fill="#FFA6CF" />
        </>
      )}
    </svg>
  )
}

/** The logo: small mascot mark beside the lowercase "langi" wordmark. */
export function Logo({ className = '', size = 34 }: { className?: string; size?: number }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mascot variant="mark" size={size} />
      <span className="display text-[1.6rem] tracking-[-0.04em] leading-none">langi</span>
    </span>
  )
}
