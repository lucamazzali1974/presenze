'use client'

import { useRef, useState, useTransition } from 'react'
import { createArchive } from '@/lib/actions/archives'
import { AthleteName } from '@/components/athlete-name'
import { download, slugDate, statsCsv } from '@/lib/csv'
import type { AttendanceStat } from '@/lib/types'

export type StatsRow = {
  id: string
  sort: string
  athlete: AttendanceStat
  training: AttendanceStat | null
  match: AttendanceStat | null
}

export function StatsView({
  rows,
  isAdmin,
}: {
  rows: StatsRow[]
  isAdmin: boolean
}) {
  const [showArchive, setShowArchive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function exportCsv() {
    const csv = statsCsv(
      rows.map((r) => ({
        name: `${r.athlete.first_name} ${r.athlete.last_name}`,
        nickname: r.athlete.nickname ?? '',
        training: r.training,
        match: r.match,
      }))
    )
    download(`presenze-${slugDate()}.csv`, csv)
  }

  function submitArchive(formData: FormData) {
    startTransition(async () => {
      const res = await createArchive(formData)
      if (res?.error) return setError(res.error)
      setError(null)
      setShowArchive(false)
      formRef.current?.reset()
    })
  }

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Statistiche</p>
        <h1 className="h1">Percentuali</h1>
        <p className="sub">
          Contano solo gli appelli chiusi, non archiviati, e solo da quando il
          giocatore è in rosa.
        </p>

        <div className="row-actions mt-5">
          <button
            type="button"
            className="btn"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Scarica CSV
          </button>

          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowArchive((v) => !v)}
            >
              {showArchive ? 'Annulla' : 'Archivia un periodo'}
            </button>
          )}
        </div>
      </div>

      {showArchive && isAdmin && (
        <form ref={formRef} action={submitArchive} className="panel mb-4 p-4">
          <p className="mini">Nuovo archivio</p>

          <div className="grid-2 mt-3">
            <label className="field">
              <span>Nome</span>
              <input name="name" placeholder="es. Stagione 2025/26" />
            </label>
            <label className="field">
              <span>Dal</span>
              <input name="from" type="date" required />
            </label>
            <label className="field">
              <span>Al</span>
              <input name="to" type="date" required />
            </label>
          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--faint)' }}>
            Gli eventi del periodo escono dal calendario e dalle percentuali
            correnti, e le percentuali di quel periodo restano fotografate
            nell’archivio. È reversibile.
          </p>

          <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
            Archivia
          </button>
        </form>
      )}

      {error && <p className="alert mb-4">{error}</p>}

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
            Ancora nessun appello chiuso. Le percentuali compaiono da lì.
          </li>
        )}
      </ul>
    </main>
  )
}

export function toneOf(pct: number) {
  if (pct >= 75) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--red)'
}

export function Stat({
  label,
  stat,
}: {
  label: string
  stat: AttendanceStat | null
}) {
  if (!stat) {
    return (
      <div>
        <p className="mini">{label}</p>
        <p className="mt-1" style={{ color: 'var(--faint)' }}>
          —
        </p>
      </div>
    )
  }

  const tone = toneOf(stat.pct)

  return (
    <div>
      <p className="mini">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="text-2xl" style={{ color: tone }}>
          {stat.pct}%
        </span>
        <span className="text-sm" style={{ color: 'var(--faint)' }}>
          {stat.attended}/{stat.expected}
        </span>
        {stat.injuries > 0 && (
          <span className="tag warn">
            {stat.injuries} per infortunio
          </span>
        )}
      </p>
      <span className="meter" aria-hidden="true">
        <span style={{ width: `${stat.pct}%`, background: tone }} />
      </span>
    </div>
  )
}
