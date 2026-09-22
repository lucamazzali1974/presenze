'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { createArchive } from '@/lib/actions/archives'
import { AthleteName } from '@/components/athlete-name'
import { download, slugDate, statsCsv } from '@/lib/csv'
import { formatDate } from '@/lib/format'
import { AttendanceCharts } from '@/components/attendance-charts'
import { MatchStats, type MatchStatsData } from '@/components/match-stats'
import type { Athlete, AttendanceStat, EventAttendance, Team } from '@/lib/types'
import { Busy } from '@/components/spinner'

export type StatsRow = {
  id: string
  sort: string
  athlete: Pick<Athlete, 'first_name' | 'last_name' | 'nickname' | 'joined_on'>
  training: AttendanceStat | null
  match: AttendanceStat | null
}

export type ClosedSummary = {
  total: number
  training: number
  match: number
  firstAt: string | null
}

export function StatsView({
  rows,
  closed,
  teams,
  selectedTeam = null,
  loadError = null,
  canArchive,
  selfOnly = false,
  matches,
  events,
}: {
  rows: StatsRow[]
  closed: ClosedSummary
  teams: Team[]
  selectedTeam?: string | null
  loadError?: string | null
  /** 'Archivio' in modifica: da qui si congela un periodo. */
  canArchive: boolean
  /** L'atleta vede solo la propria riga: cambia i testi, non i conti. */
  selfOnly?: boolean
  /** Il secondo pannello: risultati, marcatori e storico delle partite. */
  matches: MatchStatsData
  /** Affluenza appello per appello: la materia prima dei grafici. */
  events: EventAttendance[]
}) {
  const [tab, setTab] = useState<'presenze' | 'grafici' | 'partite'>('presenze')
  const [showArchive, setShowArchive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const counted = rows.filter((r) => r.training || r.match).length
  const teamLabel = teams.find((t) => t.id === selectedTeam)?.name ?? null

  function exportCsv() {
    const csv = statsCsv(
      rows.map((r) => ({
        name: `${r.athlete.first_name} ${r.athlete.last_name}`,
        nickname: r.athlete.nickname ?? '',
        training: r.training,
        match: r.match,
      }))
    )
    const suffix = teamLabel
      ? `-${teamLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      : ''
    download(`presenze${suffix}-${slugDate()}.csv`, csv)
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
      <Busy show={isPending} />

      <div className="page-head">
        <p className="eyebrow">// Statistiche</p>
        <h1 className="h1">{selfOnly ? 'Le tue percentuali' : 'Percentuali'}</h1>
        <p className="sub">
          {closed.total === 0
            ? 'Contano solo gli appelli chiusi, non archiviati, e solo da quando il giocatore è in rosa.'
            : `${closed.total} ${closed.total === 1 ? 'appello chiuso' : 'appelli chiusi'} in archivio corrente · ${closed.training} allenamenti · ${closed.match} partite`}
        </p>

        {selfOnly && teams.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-2">
            {teams.map((t) => (
              <span key={t.id} className="pill" data-on="true">
                {t.name}
              </span>
            ))}
          </p>
        )}

        {!selfOnly && teams.length > 0 && (
          <div className="filters mt-4">
            <Link href="/stats" className="pill" data-on={selectedTeam === null} scroll={false}>
              Tutte le squadre
            </Link>
            {teams.map((t) => (
              <Link
                key={t.id}
                href={`/stats?team=${t.id}`}
                className="pill"
                data-on={selectedTeam === t.id}
                scroll={false}
              >
                {t.name}
              </Link>
            ))}
          </div>
        )}

        {/* Il giocatore non ha bottoni: il CSV serve a chi gestisce la
            rosa, non a chi ha una riga sola. */}
        {!selfOnly && (
        <div className="row-actions mt-5">
          <button
            type="button"
            className="btn"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            Scarica CSV
          </button>

          {canArchive && !selectedTeam && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowArchive((v) => !v)}
            >
              {showArchive ? 'Annulla' : 'Archivia un periodo'}
            </button>
          )}
        </div>
        )}
      </div>

      {/* Due letture degli stessi appelli: quante volte c'era e, per le
          partite, come sono andate. Separarle evita una tabella che non
          entra nello schermo di un telefono. */}
      <div className="filters mb-4">
        {(
          [
            ['presenze', 'Elenco'],
            // I grafici sono una lettura di squadra: al giocatore, che
            // vede solo la propria riga, non direbbero niente.
            ...(selfOnly ? [] : [['grafici', 'Grafici'] as const]),
            ['partite', 'Partite'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="pill"
            data-on={tab === key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
          >
            {label}
          </button>
        ))}
      </div>

      {showArchive && canArchive && (
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

      {loadError && (
        <p className="alert mb-4">
          Non sono riuscito a leggere le percentuali: {loadError}
        </p>
      )}

      {error && <p className="alert mb-4">{error}</p>}

      {!loadError && !selfOnly && closed.total > 0 && counted === 0 && rows.length > 0 && (
        <p className="alert mb-4">
          Ci sono {closed.total} appelli chiusi, ma nessun giocatore li sta
          conteggiando: tutti risultano in rosa da una data successiva
          {closed.firstAt
            ? ` al ${formatDate(closed.firstAt.slice(0, 10))}`
            : ''}
          . Correggi il campo «In rosa dal» dalla pagina Atleti.
        </p>
      )}

      {tab === 'partite' ? (
        <MatchStats data={matches} rows={rows} selfOnly={selfOnly} />
      ) : tab === 'grafici' ? (
        <AttendanceCharts rows={rows} events={events} />
      ) : (
      <ul className="panel rows">
        {rows.map((r) => (
          <li key={r.id} className="row">
            <AthleteName athlete={r.athlete} block />

            {closed.total > 0 && !r.training && !r.match && r.athlete.joined_on && (
              <p className="mini mt-2">
                In rosa dal {formatDate(r.athlete.joined_on.slice(0, 10))} ·
                nessun appello chiuso da quella data
              </p>
            )}

            <div className="grid-2 mt-3">
              <Stat label="Allenamenti" stat={r.training} />
              <Stat label="Partite" stat={r.match} />
            </div>
          </li>
        ))}

        {rows.length === 0 && (
          <li className="empty">
            {selfOnly
              ? 'Il tuo account non è collegato a una scheda atleta: chiedi all’allenatore.'
              : teamLabel
              ? `Nessun giocatore assegnato a ${teamLabel}. La rosa si compone da Squadre.`
              : closed.total === 0
                ? 'Ancora nessun appello chiuso. Le percentuali compaiono da lì.'
                : 'La rosa è vuota: aggiungi i giocatori dalla pagina Atleti.'}
          </li>
        )}
      </ul>
      )}
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
