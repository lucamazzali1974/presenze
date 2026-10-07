'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AthleteName } from '@/components/athlete-name'
import {
  BarRow,
  Legend,
  Segmented,
  StackRow,
  Tiles,
  type Serie,
} from '@/components/charts'
import { dayStamp, displayName, formatEventTime } from '@/lib/format'
import {
  SCORE_FIELD,
  SCORE_KINDS,
  SCORE_LABEL,
  SCORE_POINTS,
  SCORE_SHORT,
  type Athlete,
  type MatchResult,
  type ScoreKind,
} from '@/lib/types'
import type { StatsRow } from '@/components/stats-view'

export type MatchScorer = {
  athlete_id: string
  athlete: Pick<Athlete, 'first_name' | 'last_name' | 'nickname'>
  tries: number
  conversions: number
  penalties: number
  drops: number
  points: number
  /** Incontri giocati: quelli della formazione in cui era convocato. */
  games: number
  /** Incontri in cui ha segnato almeno una volta. */
  scoredIn: number
}

export type MatchStatsData = {
  /** Una riga per incontro giocato, gia' filtrata per squadra. */
  results: MatchResult[]
  /** Classifica marcatori, dal piu' prolifico. */
  scorers: MatchScorer[]
  /** I marcatori di ogni incontro, per lo storico. */
  byGame: Record<string, MatchScorer[]>
  /** Le marcature di ogni atleta, per la scheda. */
  perAthlete: Record<string, MatchScorer>
  /** Incontri giocati per atleta, anche da chi non ha segnato. */
  gamesPlayed: Record<string, number>
}

type Block = 'bilancio' | 'marcatori' | 'atleti' | 'storico'
type Metric = 'points' | ScoreKind

const BLOCKS = [
  ['bilancio', 'Bilancio'],
  ['marcatori', 'Marcatori'],
  ['atleti', 'Per atleta'],
  ['storico', 'Storico'],
] as const

const METRICS = [
  ['points', 'Punti'],
  ['try', 'Mete'],
  ['conversion', 'Trasf.'],
  ['penalty', 'Piazzati'],
  ['drop', 'Drop'],
] as const

/** Ogni tipo di marcatura ha la sua tinta, sempre la stessa, ovunque. */
const KIND_SERIE: Record<ScoreKind, Serie> = {
  try: 1,
  conversion: 2,
  penalty: 3,
  drop: 4,
}

const LEGEND: [Serie, string][] = SCORE_KINDS.map((k) => [
  KIND_SERIE[k],
  `${SCORE_LABEL[k]} · ${SCORE_POINTS[k]}`,
])

type Counts = Pick<MatchScorer, 'tries' | 'conversions' | 'penalties' | 'drops'>

function qty(c: Counts, k: ScoreKind) {
  return c[SCORE_FIELD[k]]
}

/** I pezzi della barra impilata: punti per tipo. */
function pointSegments(c: Counts) {
  return SCORE_KINDS.map((k) => ({
    serie: KIND_SERIE[k],
    value: qty(c, k) * SCORE_POINTS[k],
    title: `${SCORE_LABEL[k]}: ${qty(c, k)} = ${qty(c, k) * SCORE_POINTS[k]} punti`,
  }))
}

/** "2 M · 1 T · 1 P" — solo i tipi che ci sono. */
function breakdown(c: Counts) {
  const parts = SCORE_KINDS.filter((k) => qty(c, k) > 0).map(
    (k) => `${qty(c, k)} ${SCORE_SHORT[k].toLowerCase()}`
  )
  return parts.length > 0 ? parts.join(' · ') : 'nessuna marcatura'
}

function sumCounts(list: Counts[]): Counts {
  return list.reduce<Counts>(
    (acc, c) => ({
      tries: acc.tries + c.tries,
      conversions: acc.conversions + c.conversions,
      penalties: acc.penalties + c.penalties,
      drops: acc.drops + c.drops,
    }),
    { tries: 0, conversions: 0, penalties: 0, drops: 0 }
  )
}

function outcomeTag(r: MatchResult) {
  if (r.outcome === null) return <span className="tag">Senza risultato</span>
  return (
    <span
      className={
        r.outcome === 'win' ? 'tag pass' : r.outcome === 'draw' ? 'tag warn' : 'tag fail'
      }
    >
      {r.points_for} – {r.points_against}
    </span>
  )
}

/**
 * Le partite. Il bilancio guarda gli incontri giocati (un triangolare ne
 * vale due o tre), i marcatori guardano le marcature divise per tipo, la
 * scheda incrocia convocazioni, presenze e punti, lo storico mette in
 * fila le giornate coi loro incontri.
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
  const [metric, setMetric] = useState<Metric>('points')

  if (data.results.length === 0) {
    return (
      <div className="panel">
        <p className="empty">
          Nessuna partita a referto. Una partita entra qui quando ha almeno un
          incontro e l’appello è stato chiuso.
        </p>
      </div>
    )
  }

  const played = data.results.filter((r) => r.outcome !== null)
  const pending = data.results.length - played.length

  const wins = played.filter((r) => r.outcome === 'win').length
  const draws = played.filter((r) => r.outcome === 'draw').length
  const losses = played.filter((r) => r.outcome === 'loss').length

  const pf = played.reduce((n, r) => n + (r.points_for ?? 0), 0)
  const pa = played.reduce((n, r) => n + (r.points_against ?? 0), 0)

  /*
   * I totali per tipo vengono dagli incontri (vista match_results), non
   * dalla classifica: per il giocatore la classifica ha solo la sua riga,
   * ma il bilancio della squadra resta quello di tutti.
   */
  const team = sumCounts(data.results)
  const teamScored = SCORE_KINDS.reduce((n, k) => n + qty(team, k) * SCORE_POINTS[k], 0)
  const scoredInPlayed = played.reduce((n, r) => n + r.scored_points, 0)
  const unassigned = pf - scoredInPlayed

  return (
    <>
      <div className="mb-4">
        <Segmented value={block} onChange={setBlock} options={BLOCKS} label="Quale statistica" />
      </div>

      {block === 'bilancio' && (
        <>
          <Tiles
            items={[
              { value: `${data.results.length}`, label: 'Incontri giocati' },
              { value: `${wins}-${draws}-${losses}`, label: 'Vinti · pari · persi' },
              { value: `${pf}`, label: 'Punti fatti' },
              { value: `${pa}`, label: 'Punti subiti' },
            ]}
          />

          <div className="mt-4">
            <Tiles
              items={SCORE_KINDS.map((k) => ({
                value: `${qty(team, k)}`,
                label: SCORE_LABEL[k],
              }))}
            />
          </div>

          <div className="panel mt-4">
            <div className="panel-head">
              <span className="mini">Come abbiamo segnato · punti per tipo</span>
              <span className="mini">{teamScored} punti dai marcatori</span>
            </div>

            <div className="chart" style={{ paddingBottom: 6 }}>
              <StackRow
                label="Totale"
                segments={pointSegments(team)}
                scale={teamScored}
                value={`${teamScored}`}
                title={breakdown(team)}
              />
            </div>
            <Legend items={LEGEND} />

            {/* Lo stesso dato, un tipo per riga: quanti e quanto valgono. */}
            <div className="chart" style={{ paddingTop: 0 }}>
              {SCORE_KINDS.map((k) => {
                const n = qty(team, k)
                const pts = n * SCORE_POINTS[k]
                return (
                  <BarRow
                    key={k}
                    label={SCORE_LABEL[k]}
                    lines={[
                      {
                        pct: teamScored > 0 ? (100 * pts) / teamScored : 0,
                        value: `${pts}`,
                        serie: KIND_SERIE[k],
                        title: `${n} ${SCORE_LABEL[k].toLowerCase()} × ${SCORE_POINTS[k]} = ${pts} punti`,
                      },
                    ]}
                  />
                )
              })}
            </div>

            <dl className="facts" style={{ padding: '4px 18px 16px' }}>
              <div>
                <dt>Mete per incontro</dt>
                <dd className="strong">
                  {(team.tries / data.results.length).toFixed(1)}
                </dd>
              </div>
              <div>
                <dt>Trasformazioni riuscite</dt>
                <dd className="strong">
                  {team.tries > 0
                    ? `${Math.round((100 * team.conversions) / team.tries)}%`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Punti al piede</dt>
                <dd className="strong">
                  {teamScored > 0
                    ? `${Math.round(
                        (100 *
                          (team.conversions * 2 + team.penalties * 3 + team.drops * 3)) /
                          teamScored
                      )}%`
                    : '—'}
                </dd>
              </div>
              {!selfOnly && (
                <div>
                  <dt>Punti senza marcatore</dt>
                  <dd className="strong">{unassigned > 0 ? unassigned : 0}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="panel mt-4">
            <div className="panel-head">
              <span className="mini">Come sono finiti</span>
              {pending > 0 && <span className="tag warn">{pending} senza risultato</span>}
            </div>

            <div className="chart">
              {(
                [
                  ['Vinti', wins, 'good'],
                  ['Pareggiati', draws, 'warn'],
                  ['Persi', losses, 'bad'],
                ] as const
              ).map(([label, n, tone]) => (
                <BarRow
                  key={label}
                  label={label}
                  lines={[
                    {
                      pct: played.length > 0 ? (100 * n) / played.length : 0,
                      value: `${n}`,
                      tone,
                      title: `${n} su ${played.length} incontri giocati`,
                    },
                  ]}
                />
              ))}
            </div>

            <dl className="facts" style={{ padding: '4px 18px 16px' }}>
              <div>
                <dt>Differenza punti</dt>
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
            </dl>
          </div>
        </>
      )}

      {block === 'marcatori' && (
        <Scorers scorers={data.scorers} metric={metric} setMetric={setMetric} />
      )}

      {block === 'atleti' && (
        <ul className="panel rows">
          {rows.map((r) => {
            const s = data.perAthlete[r.id]
            const called = r.match?.expected ?? 0
            const present = r.match?.attended ?? 0
            const games = data.gamesPlayed[r.id] ?? 0
            const top = data.scorers[0]?.points ?? 0

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
                    <dt>Incontri</dt>
                    <dd className="strong">
                      {games}
                      {s && s.scoredIn > 0 && (
                        <span style={{ color: 'var(--color-faint)' }}>
                          {' '}
                          · a segno in {s.scoredIn}
                        </span>
                      )}
                    </dd>
                  </div>
                  {SCORE_KINDS.map((k) => (
                    <div key={k}>
                      <dt>{SCORE_LABEL[k]}</dt>
                      <dd className="strong">{s ? qty(s, k) : 0}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Punti</dt>
                    <dd className="strong">
                      {s?.points ?? 0}
                      {s && games > 0 && (
                        <span style={{ color: 'var(--color-faint)' }}>
                          {' '}
                          · {(s.points / games).toFixed(1)} a incontro
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {/* La composizione dei suoi punti, in scala sul miglior
                    marcatore: si vede a colpo d'occhio chi e' il calciatore. */}
                {s && s.points > 0 && (
                  <div className="mt-3">
                    <StackRow
                      label="Punti"
                      segments={pointSegments(s)}
                      scale={selfOnly ? s.points : top}
                      value={`${s.points}`}
                      title={breakdown(s)}
                    />
                  </div>
                )}

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

          {rows.length > 0 && (
            <li className="row" style={{ paddingTop: 4 }}>
              <Legend items={LEGEND} />
            </li>
          )}
        </ul>
      )}

      {block === 'storico' && <History data={data} selfOnly={selfOnly} />}
    </>
  )
}

/** Classifica marcatori: per punti (impilati per tipo) o per un tipo solo. */
function Scorers({
  scorers,
  metric,
  setMetric,
}: {
  scorers: MatchScorer[]
  metric: Metric
  setMetric: (m: Metric) => void
}) {
  const valueOf = (s: MatchScorer) => (metric === 'points' ? s.points : qty(s, metric))

  const ranked = scorers
    .filter((s) => valueOf(s) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a) || b.points - a.points)

  const top = ranked[0] ? valueOf(ranked[0]) : 0
  const total = ranked.reduce((n, s) => n + valueOf(s), 0)

  return (
    <>
      <div className="mb-3">
        <Segmented
          value={metric}
          onChange={setMetric}
          options={METRICS}
          label="Classifica per"
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="mini">
            {metric === 'points'
              ? 'Punti segnati per tipo · barra in scala sul primo'
              : `${SCORE_LABEL[metric]} · barra in scala sul primo`}
          </span>
          <span className="mini">
            {total} {metric === 'points' ? 'punti' : SCORE_LABEL[metric].toLowerCase()} in tutto
          </span>
        </div>

        {metric === 'points' && ranked.length > 0 && (
          <div style={{ paddingTop: 12 }}>
            <Legend items={LEGEND} />
          </div>
        )}

        {/* Le barre sono in proporzione al primo della classifica: il
            confronto utile e' fra compagni, non con un massimo teorico. */}
        <div className="chart">
          {ranked.map((s) =>
            metric === 'points' ? (
              <StackRow
                key={s.athlete_id}
                label={displayName(s.athlete)}
                segments={pointSegments(s)}
                scale={top}
                value={`${s.points}`}
                sub={breakdown(s)}
                title={`${breakdown(s)} · ${s.points} punti`}
              />
            ) : (
              <BarRow
                key={s.athlete_id}
                label={displayName(s.athlete)}
                lines={[
                  {
                    pct: top > 0 ? (100 * qty(s, metric)) / top : 0,
                    value: `${qty(s, metric)}`,
                    serie: KIND_SERIE[metric],
                    title: `${qty(s, metric)} ${SCORE_LABEL[metric].toLowerCase()} · ${s.points} punti in tutto`,
                  },
                ]}
              />
            )
          )}

          {ranked.length === 0 && (
            <p className="empty">
              {scorers.length === 0
                ? 'Nessuna marcatura registrata. Si segnano dalla pagina della partita, incontro per incontro.'
                : `Ancora nessuno a segno con questo tipo di marcatura.`}
            </p>
          )}
        </div>
      </div>

      {/* La vista a numeri: tutto quello che c'e' nel grafico, leggibile
          anche senza distinguere i colori. */}
      {scorers.length > 0 && (
        <div className="panel mt-4">
          <div className="panel-head">
            <span className="mini">Tabellino completo</span>
          </div>
          <div className="table-scroll">
            <table className="num-table">
              <thead>
                <tr>
                  <th>Giocatore</th>
                  <th>Inc.</th>
                  {SCORE_KINDS.map((k) => (
                    <th key={k}>{SCORE_SHORT[k]}</th>
                  ))}
                  <th>Punti</th>
                </tr>
              </thead>
              <tbody>
                {[...scorers]
                  .sort((a, b) => b.points - a.points || b.tries - a.tries)
                  .map((s) => (
                    <tr key={s.athlete_id}>
                      <td>{displayName(s.athlete)}</td>
                      <td data-zero={s.games === 0}>{s.games}</td>
                      {SCORE_KINDS.map((k) => (
                        <td key={k} data-zero={qty(s, k) === 0}>
                          {qty(s, k)}
                        </td>
                      ))}
                      <td className="strong">{s.points}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Lo storico: prima un grafico fatti/subiti per incontro, poi le
 * giornate in ordine, ognuna coi suoi incontri — il triangolare resta
 * raccolto sotto la sua data invece di sembrare tre partite diverse.
 */
function History({ data, selfOnly }: { data: MatchStatsData; selfOnly: boolean }) {
  const withResult = data.results.filter((r) => r.outcome !== null)
  const max = withResult.reduce(
    (n, r) => Math.max(n, r.points_for ?? 0, r.points_against ?? 0),
    0
  )

  // Le giornate: gli incontri della stessa partita stanno insieme.
  const days: { eventId: string; first: MatchResult; games: MatchResult[] }[] = []
  for (const r of data.results) {
    const day = days.find((d) => d.eventId === r.event_id)
    if (day) day.games.push(r)
    else days.push({ eventId: r.event_id, first: r, games: [r] })
  }
  for (const d of days) {
    d.games.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }

  return (
    <>
      {withResult.length > 0 && (
        <div className="panel mb-4">
          <div className="panel-head">
            <span className="mini">Punti fatti e subiti per incontro</span>
          </div>
          <div style={{ paddingTop: 12 }}>
            <Legend
              items={[
                [1, 'Fatti'],
                [2, 'Subiti'],
              ]}
            />
          </div>
          <div className="chart">
            {withResult.slice(0, 20).map((r) => (
              <BarRow
                key={r.game_id}
                label={
                  <span title={dayStamp(r.starts_at)}>
                    {r.opponent ?? 'Partita'}
                  </span>
                }
                lines={[
                  {
                    pct: max > 0 ? (100 * (r.points_for ?? 0)) / max : 0,
                    value: `${r.points_for}`,
                    serie: 1,
                    title: `${dayStamp(r.starts_at)} · fatti ${r.points_for}`,
                  },
                  {
                    pct: max > 0 ? (100 * (r.points_against ?? 0)) / max : 0,
                    value: `${r.points_against}`,
                    serie: 2,
                    title: `${dayStamp(r.starts_at)} · subiti ${r.points_against}`,
                  },
                ]}
              />
            ))}
            {withResult.length > 20 && (
              <p className="mini mt-3">Gli ultimi 20 incontri. L’elenco completo è qui sotto.</p>
            )}
          </div>
        </div>
      )}

      <ul className="panel rows">
        {days.map((d) => {
          const multi = d.games.length > 1
          const lineups = new Set(d.games.map((g) => g.lineup_id)).size

          return (
            <li key={d.eventId}>
              <div className="day-head flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span style={{ color: 'var(--color-text)' }}>
                    {dayStamp(d.first.event_starts_at)}
                  </span>
                  {(d.first.title || d.first.location) && (
                    <span style={{ color: 'var(--color-muted)' }}>
                      {' '}
                      · {d.first.title ?? d.first.location}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap gap-2">
                  {multi && (
                    <span className="tag info">
                      {lineups > 1 ? 'Concentramento' : 'Triangolare'} · {d.games.length}{' '}
                      incontri
                    </span>
                  )}
                  <Link href={`/events/${d.eventId}`} className="tag">
                    Apri →
                  </Link>
                </span>
              </div>

              <ul className="rows" style={{ borderTop: '1px solid var(--color-line)' }}>
                {d.games.map((r) => {
                  const scorers = data.byGame[r.game_id] ?? []

                  return (
                    <li key={r.game_id} className="row" data-kind="match">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="nm">
                          {r.opponent ? `vs ${r.opponent}` : 'Partita'}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          {r.games_in_lineup > 1 || lineups > 1 ? (
                            <span className="tag">{r.lineup_name}</span>
                          ) : null}
                          {outcomeTag(r)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted)' }}>
                        {formatEventTime(r.starts_at)} · {r.called} convocati
                        {r.scored_points > 0 && ` · ${breakdown(r)}`}
                      </p>

                      {r.scored_points > 0 && (
                        <div className="mt-2">
                          <StackRow
                            label="Punti"
                            segments={pointSegments(r)}
                            scale={Math.max(r.scored_points, r.points_for ?? 0)}
                            value={`${r.scored_points}`}
                            title={breakdown(r)}
                          />
                        </div>
                      )}

                      {scorers.length > 0 && (
                        <p className="mini mt-2" style={{ textTransform: 'none', letterSpacing: 0 }}>
                          {scorers
                            .map(
                              (s) =>
                                `${s.athlete.nickname || s.athlete.last_name}: ${breakdown(s)} (${s.points})`
                            )
                            .join(' — ')}
                        </p>
                      )}

                      {selfOnly && scorers.length === 0 && (
                        <p className="mini mt-2">Non sei andato a segno in questo incontro.</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>

      <div className="mt-3">
        <Legend items={LEGEND} />
      </div>
    </>
  )
}
