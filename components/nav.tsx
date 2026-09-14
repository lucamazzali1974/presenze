'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/actions/auth'
import { ThemeToggle } from '@/components/theme-toggle'
import type { Profile } from '@/lib/types'

export function Nav({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  const links: [string, string][] = [
    ['/', 'Appello'],
    ['/atleti', 'Atleti'],
    ['/stats', 'Percentuali'],
    ['/archivio', 'Archivio'],
  ]

  if (profile.role === 'admin') {
    links.push(
      ['/admin/events', 'Calendario'],
      ['/admin/teams', 'Squadre'],
      ['/admin/users', 'Utenti']
    )
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/' || pathname.startsWith('/events')
    return pathname.startsWith(href)
  }

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            PRE<em>/</em>SENZE
          </span>
        </Link>

        <nav className="topnav">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}

          <form action={signOut}>
            <button type="submit">Esci</button>
          </form>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  )
}
