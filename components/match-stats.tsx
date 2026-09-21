'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AthleteName } from '@/components/athlete-name'
import { dayStamp } from '@/lib/format'
import type { Athlete, MatchResult } from '@/lib/types'
import type { StatsRow } from '@/components/stats-view'

export type MatchScorer = {
  athlete_id: string
  athlete: Pick<Athlete, 'first_name' | 'last_name' | 'nickname'>
  tries: number
  conversions: number
  penalties: number
  drops: number
  points: number
}

export type MatchStatsData = {
  /** Una riga per formazione giocata, gia' filtrata per squadra. */
  results: MatchResult[]
  /** Classifica marcatori, dal piu' prolifico. */
  scorers: MatchScorer[]
  /** I marcatori di ogni formazione, per lo storico. */
  byLineup: Record<string, MatchScorer[]>
  /** Le marcature di ogni atleta, per la scheda. */
  perAthlete: Record<string, MatchScorer>
}

type Block = 'bilancio' | 'marcatori' | 'atleti' | 'storico'

const BLOCKS: [Block, string][] = [
  ['bilancio', 'Bilancio'],
  ['marcatori', 'Marcatori'],
  ['atleti', 'Per atleta'],
  ['storico', 'Storico'],
]

/**
 * Le partite. Il bilancio guarda le formazioni giocate (una partita di
 * concentramento ne vale due o tre), i marcatori guardano le marcature,
 * la scheda incrocia le due cose: convocazioni, presenze e punti.
 */
export function MatchStats({
  data,
  rows,
  selfOnly = false,
}: {
  data: MatchStatsData
  /** Le stesse righe delle percentuali: da qui arrivano le convocazioni. */
  rows: StatsRow[]
  selfOnly?: boolean
}) {
  const [block, setBlock] = useState<Block>(selfOnly ? 'atleti' : 'bilancio')

  const played = data.results.filter((r) => r.outcome !== null)
  const pending = data.results.length - played.length

  const wins = played.filter((r) => r.outcome === 'win').length
  const draws = played.filter((r) => r.outcome === 'draw').length
  const losses = played.filter((r) => r.outcome === 'loss').length

  const pf = played.reduce((n, r) => n + (r.points_for ?? 0), 0)
  const pa = played.reduce((n, r) => n + (r.points_against ?? 0), 0)

  if (data.results.length === 0) {
    return (
      <div className="panel">
        <p className="empty">
          Nessuna partita a referto. Una partita entra qui quando ha almeno una
          formazione e l’appello è stato chiuso.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="filters mb-4">
        {BLOCKS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="pill"
            data-on={block === key}
            onClick={() => setBlock(key)}
            aria-pressed={block === key}
          >
            {label}
          </button>
        ))}
      </div>

      {block === 'bilancio' && (
        <div className="panel">
          <div className="panel-head">
            <span>
              <span className="mini">Formazioni giocate</span>
              <span
                className="mt-1 block text-2xl"
                style={{ color: 'var(--color-text)' }}
              >
                {played.length}
              </span>
            </span>

            <span className="flex flex-wrap gap-2">
              <span className="tag pass">{wins} vinte</span>
              <span className="tag warn">{draws} pari</span>
              <span className="tag fail">{losses} perse</span>
              {pending > 0 && <span className="tag">{pending} senza risultato</span>}
            </span>
          </div>

          <dl className="facts" style={{ padding: '14px 18px' }}>
            <div>
              <dt>Punti fatti</dt>
              <dd className="strong">{pf}</dd>
            </div>
            <div>
              <dt>Punti subiti</dt>
              <dd className="strong">{pa}</dd>
            </div>
            <div>
              <dt>Differenza</dt>
              <dd className="strong">
                {pf - pa > 0 ? '+' : ''}
                {pf - pa}
              </dd>
            </div>
            <div>
              <dt>Media fatti</dt>
              <dd>{played.length > 0 ? (pf / played.length).toFixed(1) : '—'}</dd>
            </div>
            <div>
              <dt>Media subiti</dt>
              <dd>{played.length > 0 ? (pa / played.length).toFixed(1) : '—'}</dd>
            </div>
            <div>
              <dt>Mete segnate</dt>
              <dd>{data.scorers.reduce((n, s) => n + s.tries, 0)}</dd>
            </div>
          </dl>
        </div>
      )}

      {block === 'marcatori' && (
        <ul className="panel rows">
          {data.scorers.map((s, i) => (
            <li key={s.athlete_id} className="row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="mini" style={{ minWidth: '1.5rem' }}>
                    {i + 1}
                  </span>
                  <AthleteName athlete={s.athlete} />
                </span>
                <span className="tag pass">{s.points} punti</span>
              </div>

              <p className="mini mt-2">
                {s.tries} mete
                {s.conversions > 0 && ` · ${s.conversions} trasformazioni`}
                {s.penalties > 0 && ` · ${s.penalties} piazzati`}
                {s.drops > 0 && ` · ${s.drops} drop`}
              </p>
            </li>
          ))}

          {data.scorers.length === 0 && (
            <li className="empty">
              Nessuna marcatura registrata. Si segnano dalla pagina della
              partita, formazione per formazione.
            </li>
          )}
        </ul>
      )}

      {block === 'atleti' && (
        <ul className="panel rows">
          {rows.map((r) => {
            const s = data.perAthlete[r.id]
            const called = r.match?.expected ?? 0
            const present = r.match?.attended ?? 0

            return (
              <li key={r.id} className="row">
                <AthleteName athlete={r.athlete} block />

                <dl className="facts">
                  <div>
                    <dt>Convocazioni</dt>
                    <dd className="strong">{called}</dd>
                  </div>
                  <div>
                    <dt>Presenze</dt>
                    <dd className="strong">
                      {present}
                      {called > 0 && (
                        <span style={{ color: 'var(--color-faint)' }}>
                          {' '}
                          · {r.match?.pct ?? 0}%
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Mete</dt>
                    <dd className="strong">{s?.tries ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Punti</dt>
                    <dd className="strong">{s?.points ?? 0}</dd>
                  </div>
                </dl>

                {called === 0 && (
                  <p className="mini mt-2">
                    Mai convocato in una partita a referto: nessuna assenza a suo
                    carico.
                  </p>
                )}
              </li>
            )
          })}

          {rows.length === 0 && <li className="empty">Nessun giocatore in elenco.</li>}
        </ul>
      )}

      {block === 'storico' && (
        <ul className="panel rows">
          {data.results.map((r) => {
            const scorers = data.byLineup[r.lineup_id] ?? []

            return (
              <li key={r.lineup_id} className="row" data-kind="match">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="nm">
                    {r.opponent ? `vs ${r.opponent}` : 'Partita'}
                  </span>

                  <span className="flex flex-wrap gap-2">
                    <span className="tag">{r.lineup_name}</span>
                    {r.outcome === null ? (
                      <span className="tag">Senza risultato</span>
                    ) : (
                      <span
                        className={
                          r.outcome === 'win'
                            ? 'tag pass'
                            : r.outcome === 'draw'
                              ? 'tag warn'
                              : 'tag fail'
                        }
                      >
                        {r.points_for} – {r.points_against}
                      </span>
                    )}
                  </span>
                </div>

                <p className="mt-1.5 text-sm" style={{ color: 'var(--color-par)' }}>
                  {dayStamp(r.starts_at)}
                  {r.location && (
                    <span style={{ color: 'var(--color-muted)' }}> · {r.location}</span>
                  )}
                  <span style={{ color: 'var(--color-muted)' }}>
                    {' '}
                    · {r.called} convocati
                  </span>
                </p>

                {scorers.length > 0 && (
                  <p className="mini mt-2">
                    {scorers
                      .map(
                        (s) =>
                          `${s.athlete.nickname || s.athlete.last_name} ${
                            s.tries > 0 ? `${s.tries}M` : ''
                          }${s.points > 0 ? ` (${s.points})` : ''}`.trim()
                      )
                      .join(' · ')}
                  </p>
                )}

                <div className="row-actions">
                  <Link href={`/events/${r.event_id}`} className="btn btn-sm">
                    Apri la partita
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
