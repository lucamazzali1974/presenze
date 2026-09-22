'use client'

import { useState } from 'react'
import { BarRow, Columns, Legend, toneFor } from '@/components/charts'
import type { StatsRow } from '@/components/stats-view'
import { displayName } from '@/lib/format'
import type { EventAttendance } from '@/lib/types'

type View = 'classifica' | 'andamento' | 'affluenza' | 'fasce'

const VIEWS: [View, string][] = [
  ['classifica', 'Classifica'],
  ['andamento', 'Andamento'],
  ['affluenza', 'Affluenza'],
  ['fasce', 'Fasce'],
]

const MONTHS = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
]

/** "2026-09" -> "set 26", per le etichette sotto le colonne. */
function monthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

function pctOf(present: number, expected: number) {
  return expected > 0 ? (100 * present) / expected : 0
}

/**
 * I grafici delle presenze. Ognuno risponde a una domanda sola:
 * chi c'e' e chi no, come sta andando il gruppo nel tempo, quali serate
 * tirano di piu', quanti sono i regolari.
 */
export function AttendanceCharts({
  rows,
  events,
}: {
  rows: StatsRow[]
  /** Appelli chiusi, gia' filtrati per la squadra scelta. */
  events: EventAttendance[]
}) {
  const [view, setView] = useState<View>('classifica')
  const [kind, setKind] = useState<'training' | 'match' | 'all'>('training')

  // ── classifica: chi c'e' sempre e chi no
  const ranked = rows
    .filter((r) => r.training || r.match)
    .sort((a, b) => (b.training?.pct ?? -1) - (a.training?.pct ?? -1))

  // ── andamento: una colonna per mese, sulla media della squadra
  const byMonth = new Map<string, { present: number; expected: number }>()
  for (const e of events) {
    const k = monthKey(e.starts_at)
    const acc = byMonth.get(k) ?? { present: 0, expected: 0 }
    acc.present += e.present
    acc.expected += e.expected
    byMonth.set(k, acc)
  }

  const months = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      key,
      pct: pctOf(v.present, v.expected),
      label: monthLabel(key),
      title: `${monthLabel(key)}: ${Math.round(pctOf(v.present, v.expected))}% · ${v.present} presenze su ${v.expected}`,
    }))

  // ── affluenza: una colonna per appello chiuso
  const listed = events
    .filter((e) => kind === 'all' || e.type === kind)
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const columns = listed.map((e) => {
    const d = new Date(e.starts_at)
    const day = `${d.getDate()}/${d.getMonth() + 1}`
    return {
      key: e.event_id,
      pct: pctOf(e.present, e.expected),
      label: day,
      title: `${day} ${e.type === 'match' ? '· partita' : '· allenamento'}: ${e.present} su ${e.expected} (${Math.round(pctOf(e.present, e.expected))}%)`,
    }
  })

  const totalPresent = listed.reduce((n, e) => n + e.present, 0)
  const totalExpected = listed.reduce((n, e) => n + e.expected, 0)

  // ── fasce: quanti regolari, quanti a intermittenza
  const withStats = rows.filter((r) => r.training)
  const bands: { label: string; tone: 'good' | 'warn' | 'bad'; n: number }[] = [
    {
      label: 'Oltre il 75%',
      tone: 'good',
      n: withStats.filter((r) => (r.training?.pct ?? 0) >= 75).length,
    },
    {
      label: 'Fra il 50 e il 75%',
      tone: 'warn',
      n: withStats.filter(
        (r) => (r.training?.pct ?? 0) >= 50 && (r.training?.pct ?? 0) < 75
      ).length,
    },
    {
      label: 'Sotto il 50%',
      tone: 'bad',
      n: withStats.filter((r) => (r.training?.pct ?? 0) < 50).length,
    },
  ]

  return (
    <>
      <div className="filters mb-4">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="pill"
            data-on={view === key}
            onClick={() => setView(key)}
            aria-pressed={view === key}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'classifica' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Presenze per giocatore</span>
            <span className="mini">{ranked.length} in elenco</span>
          </div>

          <Legend items={[[1, 'Allenamenti'], [2, 'Partite']]} />

          <div className="chart" style={{ paddingTop: 0 }}>
            {ranked.map((r) => (
              <BarRow
                key={r.id}
                label={displayName(r.athlete)}
                value={
                  r.training ? `${Math.round(r.training.pct)}%` : '—'
                }
                bars={[
                  {
                    pct: r.training?.pct ?? 0,
                    serie: 1,
                    title: r.training
                      ? `Allenamenti: ${r.training.attended} su ${r.training.expected}`
                      : 'Allenamenti: nessuno a referto',
                  },
                  {
                    pct: r.match?.pct ?? 0,
                    serie: 2,
                    title: r.match
                      ? `Partite: ${r.match.attended} su ${r.match.expected}`
                      : 'Partite: nessuna a referto',
                  },
                ]}
              />
            ))}

            {ranked.length === 0 && (
              <p className="empty">Nessun appello chiuso da mettere in classifica.</p>
            )}
          </div>
        </div>
      )}

      {view === 'andamento' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Presenze medie, mese per mese</span>
            <span className="mini">{months.length} mesi</span>
          </div>

          <Columns
            data={months}
            rule={
              totalExpected > 0
                ? pctOf(
                    events.reduce((n, e) => n + e.present, 0),
                    events.reduce((n, e) => n + e.expected, 0)
                  )
                : null
            }
            ruleLabel="Media del periodo"
          />
        </div>
      )}

      {view === 'affluenza' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Quanti si presentano, appello per appello</span>
            <span className="flex flex-wrap gap-2">
              {(
                [
                  ['training', 'Allenamenti'],
                  ['match', 'Partite'],
                  ['all', 'Tutti'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="pill"
                  data-on={kind === key}
                  onClick={() => setKind(key)}
                  aria-pressed={kind === key}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          <Columns
            data={columns}
            rule={totalExpected > 0 ? pctOf(totalPresent, totalExpected) : null}
            ruleLabel="Media"
          />
        </div>
      )}

      {view === 'fasce' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Com’è distribuita la rosa</span>
            <span className="mini">{withStats.length} con appelli a referto</span>
          </div>

          <div className="chart">
            {bands.map((b) => (
              <BarRow
                key={b.label}
                label={b.label}
                value={`${b.n}`}
                bars={[
                  {
                    pct:
                      withStats.length > 0
                        ? (100 * b.n) / withStats.length
                        : 0,
                    tone: b.tone,
                    title: `${b.n} giocatori su ${withStats.length}`,
                  },
                ]}
              />
            ))}

            {withStats.length === 0 && (
              <p className="empty">Nessun allenamento chiuso: niente da distribuire.</p>
            )}
          </div>

          <p className="mini" style={{ padding: '0 18px 16px' }}>
            Le fasce guardano gli allenamenti. Chi ha una regola sui giorni
            previsti è misurato solo sui suoi giorni, quindi non è penalizzato.
          </p>
        </div>
      )}
    </>
  )
}

export { toneFor }
