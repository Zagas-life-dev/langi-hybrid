import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Figtree, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import PWARegister from '@/components/PWARegister'
import ThemeProvider from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import './globals.css'

// Display: Bricolage Grotesque 800 for headlines, card words and big numbers.
// Body: Figtree. Geist Mono stays only for code and keyboard hints.
const bricolage = Bricolage_Grotesque({ variable: '--font-bricolage', weight: ['500', '700', '800'], subsets: ['latin', 'latin-ext'] })
const figtree = Figtree({ variable: '--font-figtree', weight: ['400', '500', '600', '700', '800'], subsets: ['latin', 'latin-ext'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Langi · Learn French. Actually remember it.',
  description: 'Learn French (and more) with a 5-box Leitner spaced-repetition system, an AI tutor, conversation practice, and curated videos.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Langi', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  // Matched to --paper in each theme; ThemeProvider keeps the live <meta> in
  // step once mounted, this is just the pre-hydration default.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff7ea' },
    { media: '(prefers-color-scheme: dark)', color: '#16112a' },
  ],
  // viewport-fit=cover is what makes env(safe-area-inset-*) report real values,
  // so the bottom tab bar clears the iPhone home indicator.
  viewportFit: 'cover',
}

// Runs before first paint: reads the saved choice and stamps <html> so the
// correct palette is already in place when the page renders. Without this the
// app paints cream-white for a frame before React can switch it to dark.
// Mirrors the logic in ThemeProvider.apply() — 'system' leaves the attribute
// off so the CSS media query decides.
const NO_FLASH = `(function(){try{var t=localStorage.getItem('langi-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html>: the NO_FLASH script sets data-theme
    // before React hydrates, which would otherwise read as an attribute mismatch.
    <html
      lang="en"
      className={`${bricolage.variable} ${figtree.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          attributes onto <body> before React hydrates, which otherwise trips a
          hydration mismatch. This only silences attribute diffs on this element. */}
      <body className="min-h-screen bg-paper text-ink antialiased flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>
            <PWARegister />
            {children}
          </ToastProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
