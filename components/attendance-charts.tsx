'use client'

import { useState } from 'react'
import {
  BarRow,
  Columns,
  Legend,
  Segmented,
  Tiles,
  toneFor,
} from '@/components/charts'
import type { StatsRow } from '@/components/stats-view'
import { displayName } from '@/lib/format'
import type { EventAttendance } from '@/lib/types'

type View = 'classifica' | 'andamento' | 'affluenza' | 'fasce'

const VIEWS = [
  ['classifica', 'Classifica'],
  ['andamento', 'Andamento'],
  ['affluenza', 'Affluenza'],
  ['fasce', 'Fasce'],
] as const

const KINDS = [
  ['training', 'Allenamenti'],
  ['match', 'Partite'],
  ['all', 'Tutti'],
] as const

const MONTHS = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
]

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

function round(n: number) {
  return Math.round(n)
}

/**
 * I grafici delle presenze. Ognuno risponde a una domanda sola: chi c'e'
 * e chi no, come sta andando il gruppo nel tempo, quali serate tirano di
 * piu', quanti sono i regolari. Sopra, i tre numeri che rispondono prima
 * ancora di guardare le barre.
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

  // ── numeri in testa
  const present = events.reduce((n, e) => n + e.present, 0)
  const expected = events.reduce((n, e) => n + e.expected, 0)
  const average = pctOf(present, expected)

  const withStats = rows.filter((r) => r.training)
  const regulars = withStats.filter((r) => (r.training?.pct ?? 0) >= 75).length

  const best = events.reduce<EventAttendance | null>(
    (top, e) =>
      !top || pctOf(e.present, e.expected) > pctOf(top.present, top.expected)
        ? e
        : top,
    null
  )

  // ── classifica: a parita' di percentuale, ordine alfabetico
  const ranked = rows
    .filter((r) => r.training || r.match)
    .sort(
      (a, b) =>
        (b.training?.pct ?? -1) - (a.training?.pct ?? -1) ||
        (b.match?.pct ?? -1) - (a.match?.pct ?? -1) ||
        a.sort.localeCompare(b.sort, 'it')
    )

  // ── andamento: una colonna per mese
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
      title: `${monthLabel(key)}: ${round(pctOf(v.present, v.expected))}% · ${v.present} presenze su ${v.expected} attese`,
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
      value: `${e.present}`,
      title: `${day} · ${e.type === 'match' ? 'partita' : 'allenamento'}: ${e.present} presenti su ${e.expected} (${round(pctOf(e.present, e.expected))}%)`,
    }
  })

  const kindPresent = listed.reduce((n, e) => n + e.present, 0)
  const kindExpected = listed.reduce((n, e) => n + e.expected, 0)

  // ── fasce
  const bands = [
    {
      label: 'Oltre il 75%',
      tone: 'good' as const,
      n: withStats.filter((r) => (r.training?.pct ?? 0) >= 75).length,
    },
    {
      label: 'Fra 50 e 75%',
      tone: 'warn' as const,
      n: withStats.filter(
        (r) => (r.training?.pct ?? 0) >= 50 && (r.training?.pct ?? 0) < 75
      ).length,
    },
    {
      label: 'Sotto il 50%',
      tone: 'bad' as const,
      n: withStats.filter((r) => (r.training?.pct ?? 0) < 50).length,
    },
  ]

  if (events.length === 0) {
    return (
      <div className="panel">
        <p className="empty">
          Ancora nessun appello chiuso: i grafici compaiono da lì.
        </p>
      </div>
    )
  }

  return (
    <>
      <Tiles
        items={[
          { value: `${round(average)}%`, label: 'Presenza media' },
          {
            value: `${regulars}/${withStats.length}`,
            label: 'Sopra il 75%',
          },
          { value: `${events.length}`, label: 'Appelli a referto' },
          {
            value: best ? `${round(pctOf(best.present, best.expected))}%` : '—',
            label: 'Miglior affluenza',
          },
        ]}
      />

      <div className="mt-4 mb-4">
        <Segmented
          value={view}
          onChange={setView}
          options={VIEWS}
          label="Quale grafico"
        />
      </div>

      {view === 'classifica' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Presenze per giocatore</span>
            <span className="mini">{ranked.length} in elenco</span>
          </div>

          <Legend
            items={[
              [1, 'Allenamenti'],
              [2, 'Partite'],
            ]}
          />

          <div className="chart" style={{ paddingTop: 0 }}>
            {ranked.map((r) => (
              <BarRow
                key={r.id}
                label={displayName(r.athlete)}
                lines={[
                  {
                    pct: r.training?.pct ?? 0,
                    value: r.training ? `${round(r.training.pct)}%` : '—',
                    serie: 1,
                    title: r.training
                      ? `Allenamenti: ${r.training.attended} su ${r.training.expected}`
                      : 'Allenamenti: nessuno a referto',
                  },
                  {
                    pct: r.match?.pct ?? 0,
                    value: r.match ? `${round(r.match.pct)}%` : '—',
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
            <span className="mini">
              {months.length} {months.length === 1 ? 'mese' : 'mesi'}
            </span>
          </div>

          <Columns
            data={months}
            rule={expected > 0 ? average : null}
            ruleLabel="Media del periodo"
            empty="Serve almeno un mese di appelli chiusi."
          />
        </div>
      )}

      {view === 'affluenza' && (
        <div className="panel">
          <div className="panel-head">
            <span className="mini">Quanti si presentano, appello per appello</span>
            <Segmented
              value={kind}
              onChange={setKind}
              options={KINDS}
              label="Quali appelli"
            />
          </div>

          <Columns
            data={columns}
            rule={kindExpected > 0 ? pctOf(kindPresent, kindExpected) : null}
            ruleLabel="Media"
            empty={
              kind === 'match'
                ? 'Nessuna partita con l’appello chiuso.'
                : 'Nessun allenamento con l’appello chiuso.'
            }
          />

          <p className="mini" style={{ padding: '0 18px 16px' }}>
            L’altezza è la percentuale di presenti, il numero sopra è quanti
            erano. Gli attesi cambiano da una data all’altra: contano solo i
            giocatori già in rosa, della squadra giusta e nei loro giorni.
          </p>
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
                lines={[
                  {
                    pct: withStats.length > 0 ? (100 * b.n) / withStats.length : 0,
                    value: `${b.n}`,
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
