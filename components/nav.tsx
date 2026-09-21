'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/actions/auth'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  SECTION_META,
  hrefFor,
  navSections,
  type Perms,
  type Section,
} from '@/lib/permissions'

/**
 * Il menu e' il riflesso della matrice dei permessi: una voce esiste solo
 * se la sezione e' almeno in lettura, e punta alla pagina di gestione
 * quando il ruolo puo' modificarla. Nascondere non e' proteggere — a
 * negare davvero sono i gate di pagina e la RLS — ma non ha senso
 * mostrare porte chiuse.
 *
 * Su telefono le voci sono troppe per una barra sola: si passa a un
 * pannello a tutto schermo, dove ogni voce e' una riga da toccare.
 */
export function Nav({ perms }: { perms: Perms }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const sections = navSections(perms)
  const links: { href: string; label: string; section?: Section }[] = sections.map(
    (s) => ({ href: hrefFor(perms, s), label: SECTION_META[s].label, section: s })
  )

  // Da qui ognuno si cambia la password, senza passare dall'admin.
  links.push({ href: '/profilo', label: 'Profilo' })

  // Cambiata pagina, il pannello ha finito il suo lavoro.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Esc chiude, e sotto il pannello la pagina non deve scorrere.
  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function isActive(href: string, section?: Section) {
    if (href === '/') return pathname === '/' || pathname.startsWith('/events')
    // La pagina di gestione e quella in sola lettura sono la stessa voce.
    if (section === 'calendario') {
      return pathname.startsWith('/calendario') || pathname.startsWith('/admin/events')
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              PRE<em>/</em>SENZE
            </span>
          </Link>

          <nav className="topnav">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href, l.section) ? 'page' : undefined}
              >
                {l.label}
              </Link>
            ))}

            <form action={signOut}>
              <button type="submit">Esci</button>
            </form>
          </nav>

          <span className="flex items-center gap-2">
            <ThemeToggle />

            <button
              type="button"
              className="burger"
              aria-expanded={open}
              aria-controls="menu-mobile"
              aria-label={open ? 'Chiudi il menu' : 'Apri il menu'}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
            </button>
          </span>
        </div>
      </header>

      {open && (
        <div className="drawer" id="menu-mobile">
          <nav>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href, l.section) ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="drawer-foot">
            <form action={signOut}>
              <button type="submit">Esci</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
