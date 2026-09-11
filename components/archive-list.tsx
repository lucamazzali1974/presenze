'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { purgeArchive, restoreArchive } from '@/lib/actions/archives'
import { formatShort } from '@/lib/format'
import type { Archive } from '@/lib/types'

function periodo(a: Archive) {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(`${d}T12:00:00`))
  return `${fmt(a.from_date)} – ${fmt(a.to_date)}`
}

export function ArchiveList({
  archives,
  isAdmin,
}: {
  archives: Archive[]
  isAdmin: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const res = await fn()
      setError(res?.error ?? null)
    })
  }

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Archivio</p>
        <h1 className="h1">Periodi archiviati</h1>
        <p className="sub">
          Ogni archivio conserva il calendario e le percentuali di un periodo,
          fuori dai dati correnti.
        </p>
      </div>

      {error && <p className="alert mb-4">{error}</p>}

      <ul className="panel rows">
        {archives.map((a) => (
          <li key={a.id} className="row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/archivio/${a.id}`}
                style={{ color: 'var(--text)', fontWeight: 500 }}
              >
                {a.name || periodo(a)}
              </Link>
              <span className="tag">{a.events_count} eventi</span>
            </div>

            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {periodo(a)} · archiviato il {formatShort(a.created_at)}
            </p>

            <div className="row-actions">
              <Link href={`/archivio/${a.id}`} className="btn btn-sm">
                Apri
              </Link>

              {isAdmin && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Ripristinare "${a.name || periodo(a)}"? Gli eventi tornano nel calendario e nelle percentuali correnti, e l’archivio sparisce.`
                        )
                      ) {
                        run(() => restoreArchive(a.id))
                      }
                    }}
                  >
                    Ripristina
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Eliminare per sempre "${a.name || periodo(a)}"? Spariscono ${a.events_count} eventi con tutte le loro presenze. Non è reversibile.`
                        )
                      ) {
                        run(() => purgeArchive(a.id))
                      }
                    }}
                  >
                    Elimina per sempre
                  </button>
                </>
              )}
            </div>
          </li>
        ))}

        {archives.length === 0 && (
          <li className="empty">
            Nessun archivio. Se ne crea uno dalla pagina Percentuali.
          </li>
        )}
      </ul>
    </main>
  )
}
