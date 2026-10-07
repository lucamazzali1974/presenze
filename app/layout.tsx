import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { InstallPrompt } from '@/components/install-prompt'
import { OfflineBanner } from '@/components/offline-banner'
import { AutoRefresh } from '@/components/auto-refresh'
import './globals.css'

// TT Fors (il font di seocheck.therope.it) e' su licenza e non e'
// ridistribuibile: Figtree e' la geometrica libera piu' vicina.
// Sta nel repo (variabile, sottoinsieme latin, licenza OFL in
// app/fonts) invece di arrivare da next/font/google: cosi' la build non
// dipende da Google Fonts, che a ottobre 2026 l'ha fatta fallire.
const figtree = localFont({
  src: './fonts/figtree-latin-wght-normal.woff2',
  weight: '300 900',
  style: 'normal',
  variable: '--font-figtree',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Presenze',
  description: 'Appello allenamenti e partite',
  manifest: '/manifest.json',
  applicationName: 'Presenze',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Presenze',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.ico',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Applica il tema prima del primo paint: senza, al ricarico si vede
// un lampo scuro anche per chi ha scelto il chiaro.
const themeScript = `
(function () {
  try {
    var saved = localStorage.getItem('presenze-theme');
    var light = saved
      ? saved === 'light'
      : window.matchMedia('(prefers-color-scheme: light)').matches;
    if (light) document.documentElement.classList.add('light');
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <OfflineBanner />
        <AutoRefresh />
        {children}
        <InstallPrompt />
      </body>
    </html>
  )
}
