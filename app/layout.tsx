import type { Metadata, Viewport } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'

// TT Fors (il font di seocheck.therope.it) e' su licenza e non e'
// ridistribuibile: Figtree e' la geometrica libera piu' vicina.
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-figtree',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Presenze',
  description: 'Appello allenamenti e partite',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Presenze' },
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
      <body>{children}</body>
    </html>
  )
}
