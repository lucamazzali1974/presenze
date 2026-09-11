'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { purgeArchive, restoreArchive } from '@/lib/actions/archives'
import { Stat } from '@/components/stats-view'
import { AthleteName } from '@/components/athlete-name'
import { download, eventsCsv, statsCsv } from '@/lib/csv'
import { EVENT_LABEL, dayStamp, formatEventTime, monthLabel } from '@/lib/format'
import type { Archive, AttendanceStat, Event } from '@/lib/types'

export function ArchiveDetail({
  archive,
  events,
  isAdmin,
}: {
  archive: Archive
  events: Event[]
  isAdmin: boolean
}) {
  const [tab, setTab] = useState<'stats' | 'events'>('stats')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const snapshot = (archive.snapshot ?? []) as AttendanceStat[]

  type Row = {
    id: string
    sort: string
    athlete: AttendanceStat
    training: AttendanceStat | null
    match: AttendanceStat | null
  }

  const byAthlete = new Map<string, Row>()
  for (const s of snapshot) {
    const row =
      byAthlete.get(s.athlete_id) ??
      ({
        id: s.athlete_id,
        sort: `${s.last_name} ${s.first_name}`,
        athlete: s,
        training: null,
        match: null,
      } as Row)
    row[s.type] = s
    byAthlete.set(s.athlete_id, row)
  }

  const rows = [...byAthlete.values()].sort((a, b) =>
    a.sort.localeCompare(b.sort, 'it')
  )

  const slug = (archive.name || `${archive.from_date}_${archive.to_date}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const res = await fn()
      setError(res?.error ?? null)
    })
  }

  const groups: { label: string; events: Event[] }[] = []
  for (const e of events) {
    const label = monthLabel(e.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(e)
    else groups.push({ label, events: [e] })
  }

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Archivio</p>
        <h1 className="h1">{archive.name || 'Periodo archiviato'}</h1>
        <p className="sub">
          {archive.from_date} → {archive.to_date} · {archive.events_count} eventi ·{' '}
          {rows.length} giocatori
        </p>

        <div className="row-actions mt-5">
          <Link href="/archivio" className="btn btn-sm">
            Tutti gli archivi
          </Link>

          <button
            type="button"
            className="btn btn-sm"
            disabled={rows.length === 0}
            onClick={() =>
              download(
                `percentuali-${slug}.csv`,
                statsCsv(
                  rows.map((r) => ({
                    name: `${r.athlete.first_name} ${r.athlete.last_name}`,
                    nickname: r.athlete.nickname ?? '',
                    training: r.training,
                    match: r.match,
                  }))
                )
              )
            }
          >
            CSV percentuali
          </button>

          <button
            type="button"
            className="btn btn-sm"
            disabled={events.length === 0}
            onClick={() => download(`calendario-${slug}.csv`, eventsCsv(events))}
          >
            CSV calendario
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={isPending}
                onClick={() => {
                  if (
                    confirm(
                      'Ripristinare l’archivio? Gli eventi tornano nel calendario e nelle percentuali correnti.'
                    )
                  ) {
                    run(() => restoreArchive(archive.id))
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
                      `Eliminare per sempre? Spariscono ${archive.events_count} eventi con tutte le loro presenze. Non è reversibile.`
                    )
                  ) {
                    run(() => purgeArchive(archive.id))
                  }
                }}
              >
                Elimina per sempre
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="alert mb-4">{error}</p>}

      <div className="filters mb-3">
        <button
          type="button"
          className="pill"
          data-on={tab === 'stats'}
          onClick={() => setTab('stats')}
        >
          Percentuali
        </button>
        <button
          type="button"
          className="pill"
          data-on={tab === 'events'}
          onClick={() => setTab('events')}
        >
          Calendario
        </button>
      </div>

      {tab === 'stats' ? (
        <ul className="panel rows">
          {rows.map((r) => (
            <li key={r.id} className="row">
              <AthleteName athlete={r.athlete} block />
              <div className="grid-2 mt-3">
                <Stat label="Allenamenti" stat={r.training} />
                <Stat label="Partite" stat={r.match} />
              </div>
            </li>
          ))}

          {rows.length === 0 && (
            <li className="empty">
              Nessun appello chiuso in questo periodo: non c’erano percentuali da
              fotografare.
            </li>
          )}
        </ul>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.label} className="mb-4">
              <p className="mini mb-2">{g.label}</p>
              <ul className="panel rows">
                {g.events.map((e) => (
                  <li key={e.id} className="row">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                        {e.title || EVENT_LABEL[e.type]}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <span className={e.type === 'match' ? 'tag info' : 'tag'}>
                          {EVENT_LABEL[e.type]}
                        </span>
                        <span className={e.closed_at ? 'tag pass' : 'tag warn'}>
                          {e.closed_at ? 'Chiuso' : 'Mai chiuso'}
                        </span>
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm">
                      <span style={{ color: 'var(--par)' }}>
                        {dayStamp(e.starts_at)} · {formatEventTime(e.starts_at)}
                      </span>
                      {e.location && (
                        <span style={{ color: 'var(--muted)' }}> · {e.location}</span>
                      )}
                    </p>

                    <div className="row-actions">
                      <Link href={`/events/${e.id}`} className="btn btn-sm">
                        Vedi appello
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {events.length === 0 && (
            <div className="panel">
              <p className="empty">Nessun evento in questo archivio.</p>
            </div>
          )}
        </>
      )}
    </main>
  )
}
