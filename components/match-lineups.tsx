'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createGame,
  createLineup,
  deleteGame,
  deleteLineup,
  markTheRest,
  setLineupMembers,
  setScore,
  setupMatch,
  updateGame,
  updateLineup,
} from '@/lib/actions/lineups'
import { AthleteName } from '@/components/athlete-name'
import { GamesDraft, readGames } from '@/components/games-draft'
import { Busy } from '@/components/spinner'
import { formatEventTime, fullName, toLocalInputs } from '@/lib/format'
import {
  SCORE_KINDS,
  SCORE_SHORT,
  SCORE_POINTS,
  type Athlete,
  type Event,
  type Game,
  type Lineup,
  type Score,
  type ScoreKind,
} from '@/lib/types'

export type GameData = {
  game: Game
  scores: Score[]
}

export type LineupData = {
  lineup: Lineup
  memberIds: string[]
  /** Almeno uno: la partita singola ne ha uno, il triangolare di piu'. */
  games: GameData[]
}

/** Cosa e' aperto: un pannello della formazione o di un suo incontro. */
type Open =
  | { on: 'lineup'; id: string; panel: 'members' | 'edit' | 'add-game' }
  | { on: 'game'; id: string; panel: 'scores' | 'edit' }
  | null

function resultTag(pf: number | null, pa: number | null) {
  if (pf === null || pa === null) return <span className="tag">Risultato da inserire</span>
  return (
    <span className={pf > pa ? 'tag pass' : pf < pa ? 'tag fail' : 'tag warn'}>
      {pf} – {pa}
    </span>
  )
}

/**
 * Le formazioni di una partita e i loro incontri.
 *
 *   partita singola  -> una formazione, un incontro
 *   triangolare      -> una formazione, due o piu' incontri, stessi convocati
 *   concentramento   -> piu' formazioni, ognuna coi suoi incontri
 *
 * Un atleta sta in una formazione sola; risultato e marcature stanno
 * sull'incontro.
 */
export function MatchLineups({
  event,
  lineups,
  athletes,
  canEdit,
}: {
  event: Event
  lineups: LineupData[]
  /** La rosa fra cui scegliere: i giocatori della squadra dell'evento. */
  athletes: Athlete[]
  canEdit: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [setup, setSetup] = useState<'multi' | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // La data della partita: gli orari si scrivono come sola ora e la data
  // gliela diamo noi, non si gioca in un altro giorno.
  const eventDate = toLocalInputs(event.starts_at).date

  function run(fn: () => Promise<{ error?: string } | undefined>, done?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (res?.error) return setError(res.error)
      setError(null)
      setNotice(null)
      done?.()
    })
  }

  function toggle(next: NonNullable<Open>) {
    setError(null)
    setOpen((cur) =>
      cur && cur.on === next.on && cur.id === next.id && cur.panel === next.panel
        ? null
        : next
    )
  }

  function isOpen(on: 'lineup' | 'game', id: string, panel: string) {
    return open?.on === on && open.id === id && open.panel === panel
  }

  /*
   * Fatte le squadre, chi resta fuori va segnato: o assente, e pesa sulle
   * percentuali, o non convocato, e la partita esce dai suoi conti.
   */
  function markRest(notCalled: boolean) {
    startTransition(async () => {
      const res = await markTheRest(event.id, notCalled)
      if (res?.error) return setError(res.error)
      setError(null)
      setNotice(
        res.count === 0
          ? 'Nessuno da segnare: chi è fuori dalle formazioni ha già una posizione sul tabellone.'
          : notCalled
            ? `Segnati ${res.count} non convocati: per loro questa partita non entra nelle percentuali.`
            : `Segnati ${res.count} assenti: l’assenza pesa sulle loro percentuali.`
      )
    })
  }

  const lineupOf = new Map<string, string>()
  for (const l of lineups) {
    for (const id of l.memberIds) lineupOf.set(id, l.lineup.name)
  }

  const assigned = lineupOf.size
  const gamesCount = lineups.reduce((n, l) => n + l.games.length, 0)

  return (
    <section className="panel mt-5">
      <Busy show={isPending} />

      <div className="panel-head">
        <span>
          <span className="mini">Formazioni e incontri</span>
          <span className="mt-1 block" style={{ color: 'var(--color-text)' }}>
            {lineups.length === 0
              ? 'Nessuna'
              : `${lineups.length} ${lineups.length === 1 ? 'formazione' : 'formazioni'} · ${gamesCount} ${gamesCount === 1 ? 'incontro' : 'incontri'} · ${assigned} convocati`}
          </span>
        </span>

        {canEdit && lineups.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              setError(null)
              setShowForm((v) => !v)
            }}
          >
            {showForm ? 'Annulla' : 'Aggiungi formazione'}
          </button>
        )}
      </div>

      {error && (
        <div className="row">
          <p className="alert">{error}</p>
        </div>
      )}

      {notice && (
        <div className="row">
          <p className="text-sm" style={{ color: 'var(--color-green)' }}>
            {notice}
          </p>
        </div>
      )}

      {/* Partita ancora da impostare: le due strade, una per caso. */}
      {lineups.length === 0 && canEdit && (
        <div className="row">
          <p className="text-sm" style={{ color: 'var(--color-par)' }}>
            Come si gioca questa partita?
          </p>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={isPending}
              onClick={() => run(() => setupMatch(event.id, [{}]))}
            >
              Partita singola
            </button>
            <button
              type="button"
              className="btn btn-sm"
              data-on={setup === 'multi'}
              onClick={() => setSetup((v) => (v ? null : 'multi'))}
            >
              Più incontri (triangolare)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowForm((v) => !v)}
            >
              Formazione vuota
            </button>
          </div>

          <p className="mt-2 text-sm" style={{ color: 'var(--color-faint)' }}>
            Partita singola e più incontri creano una formazione con tutta la
            rosa convocata: togli dopo chi non gioca. Formazione vuota serve al
            concentramento con più squadre, ognuna coi suoi convocati.
          </p>

          {setup === 'multi' && (
            <form
              className="mt-4"
              action={(formData) =>
                run(
                  () => setupMatch(event.id, readGames(formData)),
                  () => setSetup(null)
                )
              }
            >
              <GamesDraft initial={2} defaultOpponent="Avversario" />
              <button
                type="submit"
                className="btn btn-sm btn-primary mt-4"
                disabled={isPending}
              >
                Crea gli incontri
              </button>
            </form>
          )}
        </div>
      )}

      {canEdit && lineups.length > 0 && (
        <div className="row">
          <p className="mini">Chi è rimasto fuori da tutte le formazioni</p>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={isPending}
              onClick={() => markRest(false)}
            >
              Segnali assenti
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={isPending}
              onClick={() => markRest(true)}
            >
              Segnali non convocati
            </button>
          </div>

          <p className="mt-2 text-sm" style={{ color: 'var(--color-faint)' }}>
            Assente pesa sulle percentuali, non convocato toglie del tutto la
            partita dai suoi conti. Chi hai già segnato a mano sul tabellone
            non viene toccato.
          </p>
        </div>
      )}

      {showForm && canEdit && (
        <form
          ref={formRef}
          action={(formData) =>
            run(
              () => createLineup(event.id, formData),
              () => {
                formRef.current?.reset()
                setShowForm(false)
              }
            )
          }
          className="row"
        >
          <input type="hidden" name="date" value={eventDate} />
          <input type="hidden" name="sort" value={(lineups.length + 1) * 10} />

          <div className="grid-2">
            <label className="field">
              <span>Nome</span>
              <input name="name" placeholder="es. Squadra A" required />
            </label>
            <label className="field">
              <span>Ritrovo</span>
              <input name="meet_time" type="time" />
            </label>
            <label className="field">
              <span>Primo incontro · avversario</span>
              <input name="opponent" placeholder={event.opponent ?? 'come la partita'} />
            </label>
            <label className="field">
              <span>Primo incontro · inizio</span>
              <input name="time" type="time" />
            </label>
          </div>

          <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
            Orario e avversario lasciati vuoti seguono quelli della partita. Gli
            altri incontri si aggiungono dalla formazione.
          </p>

          <button type="submit" className="btn btn-sm btn-primary mt-4" disabled={isPending}>
            Crea formazione
          </button>
        </form>
      )}

      {lineups.length === 0 && !canEdit && (
        <p className="empty">Nessuna formazione per questa partita.</p>
      )}

      {lineups.length > 0 && (
        <ul className="rows" style={{ borderTop: '1px solid var(--color-line)' }}>
          {lineups.map((data) => {
            const l = data.lineup
            const members = athletes.filter((a) => data.memberIds.includes(a.id))
            const single = data.games.length === 1

            return (
              <li key={l.id} className="row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="nm">{l.name}</span>

                  <span className="flex flex-wrap gap-2">
                    {single
                      ? resultTag(data.games[0].game.points_for, data.games[0].game.points_against)
                      : <span className="tag info">{data.games.length} incontri</span>}
                    <span className="tag">{data.memberIds.length} convocati</span>
                  </span>
                </div>

                {l.meet_at && (
                  <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted)' }}>
                    Ritrovo {formatEventTime(l.meet_at)}
                  </p>
                )}

                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => toggle({ on: 'lineup', id: l.id, panel: 'members' })}
                  >
                    {canEdit ? 'Convocati' : 'Vedi i convocati'}
                  </button>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => toggle({ on: 'lineup', id: l.id, panel: 'add-game' })}
                      >
                        Aggiungi incontro
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => toggle({ on: 'lineup', id: l.id, panel: 'edit' })}
                      >
                        Nome e ritrovo
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Eliminare la formazione “${l.name}”? Spariscono convocati, incontri e marcature; le presenze della partita restano.`
                            )
                          ) {
                            run(() => deleteLineup(l.id))
                          }
                        }}
                      >
                        Elimina
                      </button>
                    </>
                  )}
                </div>

                {isOpen('lineup', l.id, 'members') && (
                  <MemberPicker
                    athletes={athletes}
                    selected={new Set(data.memberIds)}
                    lineupOf={lineupOf}
                    lineupName={l.name}
                    pending={isPending}
                    readOnly={!canEdit}
                    onSave={(ids) =>
                      run(() => setLineupMembers(l.id, ids), () => setOpen(null))
                    }
                  />
                )}

                {isOpen('lineup', l.id, 'edit') && canEdit && (
                  <form
                    action={(formData) =>
                      run(() => updateLineup(l.id, formData), () => setOpen(null))
                    }
                    className="mt-4"
                  >
                    <input type="hidden" name="date" value={eventDate} />
                    <div className="grid-2">
                      <label className="field">
                        <span>Nome</span>
                        <input name="name" defaultValue={l.name} required />
                      </label>
                      <label className="field">
                        <span>Ritrovo</span>
                        <input
                          name="meet_time"
                          type="time"
                          defaultValue={l.meet_at ? toLocalInputs(l.meet_at).time : ''}
                        />
                      </label>
                    </div>
                    <div className="row-actions">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={isPending}>
                        Salva
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
                        Annulla
                      </button>
                    </div>
                  </form>
                )}

                {isOpen('lineup', l.id, 'add-game') && canEdit && (
                  <form
                    action={(formData) =>
                      run(() => createGame(l.id, formData), () => setOpen(null))
                    }
                    className="mt-4"
                  >
                    <input type="hidden" name="date" value={eventDate} />
                    <input type="hidden" name="sort" value={(data.games.length + 1) * 10} />
                    <div className="grid-2">
                      <label className="field">
                        <span>Avversario</span>
                        <input name="opponent" placeholder={event.opponent ?? 'es. Rugby Monza'} />
                      </label>
                      <label className="field">
                        <span>Inizio</span>
                        <input name="time" type="time" />
                      </label>
                    </div>
                    <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
                      Gioca con gli stessi convocati della formazione, con il suo
                      risultato e le sue marcature.
                    </p>
                    <div className="row-actions">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={isPending}>
                        Crea incontro
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
                        Annulla
                      </button>
                    </div>
                  </form>
                )}

                {/* Gli incontri della formazione */}
                <ul className="games">
                  {data.games.map(({ game: g, scores }, i) => {
                    const opponent = g.opponent ?? l.opponent ?? event.opponent
                    const startsAt = g.starts_at ?? l.starts_at ?? event.starts_at
                    const points = scores.reduce(
                      (n, s) => n + s.qty * SCORE_POINTS[s.kind],
                      0
                    )

                    return (
                      <li key={g.id} className="game">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="mini block">
                              {single ? 'Incontro' : `Incontro ${i + 1}`}
                            </span>
                            <span style={{ color: 'var(--color-text)' }}>
                              {opponent ? `vs ${opponent}` : 'Avversario da indicare'}
                            </span>
                          </span>
                          {resultTag(g.points_for, g.points_against)}
                        </div>

                        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
                          {formatEventTime(startsAt)}
                          {points > 0 && ` · ${points} punti dai marcatori`}
                        </p>

                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => toggle({ on: 'game', id: g.id, panel: 'scores' })}
                          >
                            Marcature
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggle({ on: 'game', id: g.id, panel: 'edit' })}
                            >
                              Risultato e orario
                            </button>
                          )}
                          {canEdit && !single && (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Eliminare l’incontro${opponent ? ` contro ${opponent}` : ''}? Spariscono risultato e marcature.`
                                  )
                                ) {
                                  run(() => deleteGame(g.id))
                                }
                              }}
                            >
                              Elimina
                            </button>
                          )}
                        </div>

                        {isOpen('game', g.id, 'scores') && (
                          <ScoreBoard
                            game={g}
                            members={members}
                            scores={scores}
                            pending={isPending}
                            readOnly={!canEdit}
                            onSet={(athleteId, kind, qty) =>
                              run(() => setScore(g.id, athleteId, kind, qty))
                            }
                          />
                        )}

                        {isOpen('game', g.id, 'edit') && canEdit && (
                          <form
                            action={(formData) =>
                              run(() => updateGame(g.id, formData), () => setOpen(null))
                            }
                            className="mt-4"
                          >
                            <input type="hidden" name="date" value={eventDate} />

                            <div className="grid-2">
                              <label className="field">
                                <span>Avversario</span>
                                <input
                                  name="opponent"
                                  defaultValue={g.opponent ?? ''}
                                  placeholder={l.opponent ?? event.opponent ?? 'come la partita'}
                                />
                              </label>
                              <label className="field">
                                <span>Inizio</span>
                                <input
                                  name="time"
                                  type="time"
                                  defaultValue={g.starts_at ? toLocalInputs(g.starts_at).time : ''}
                                />
                              </label>
                              <label className="field">
                                <span>Punti nostri</span>
                                <input
                                  name="points_for"
                                  type="number"
                                  min={0}
                                  max={999}
                                  inputMode="numeric"
                                  defaultValue={g.points_for ?? ''}
                                />
                              </label>
                              <label className="field">
                                <span>Punti avversario</span>
                                <input
                                  name="points_against"
                                  type="number"
                                  min={0}
                                  max={999}
                                  inputMode="numeric"
                                  defaultValue={g.points_against ?? ''}
                                />
                              </label>
                            </div>

                            <div className="row-actions">
                              <button
                                type="submit"
                                className="btn btn-sm btn-primary"
                                disabled={isPending}
                              >
                                Salva
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setOpen(null)}
                              >
                                Annulla
                              </button>
                            </div>
                          </form>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Chi va in questa formazione. Chi e' gia' in un'altra lo dice l'etichetta. */
function MemberPicker({
  athletes,
  selected,
  lineupOf,
  lineupName,
  pending,
  readOnly,
  onSave,
}: {
  athletes: Athlete[]
  selected: Set<string>
  lineupOf: Map<string, string>
  lineupName: string
  pending: boolean
  readOnly: boolean
  onSave: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected))

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const listed = readOnly ? athletes.filter((a) => picked.has(a.id)) : athletes

  return (
    <div className="mt-4">
      <p className="mini mb-2">Convocati</p>

      <div className="flex flex-wrap gap-2">
        {listed.map((a) => {
          const elsewhere = lineupOf.get(a.id)
          const busy = Boolean(elsewhere) && elsewhere !== lineupName && !picked.has(a.id)

          return (
            <label
              key={a.id}
              className="day"
              style={{ width: 'auto', padding: '0 14px', opacity: busy ? 0.55 : 1 }}
              title={busy ? `Ora è in ${elsewhere}` : undefined}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={picked.has(a.id)}
                disabled={readOnly}
                onChange={() => toggle(a.id)}
              />
              <AthleteName athlete={a} />
            </label>
          )
        })}
      </div>

      {listed.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
          {readOnly ? 'Nessun convocato.' : 'La rosa è vuota.'}
        </p>
      )}

      {!readOnly && (
        <>
          <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
            Chi è già in un’altra formazione ci esce appena lo selezioni qui: un
            giocatore sta in una squadra sola. I convocati valgono per tutti gli
            incontri della formazione.
          </p>

          <div className="row-actions">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={pending}
              onClick={() => onSave([...picked])}
            >
              Salva convocati
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPicked(new Set(selected))}
            >
              Ripristina
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Le marcature dell'incontro: per ogni convocato i quattro contatori
 * insieme — mete, trasformazioni, piazzati, drop — col totale punti
 * accanto al nome. Il riepilogo in fondo dice se i punti dei marcatori
 * quadrano col risultato.
 */
function ScoreBoard({
  game,
  members,
  scores,
  pending,
  readOnly,
  onSet,
}: {
  game: Game
  members: Athlete[]
  scores: Score[]
  pending: boolean
  readOnly: boolean
  onSet: (athleteId: string, kind: ScoreKind, qty: number) => void
}) {
  // Copia locale: il + deve rispondere subito, la riscrittura arriva dopo.
  const [local, setLocal] = useState<Record<string, number>>(() =>
    Object.fromEntries(scores.map((s) => [`${s.athlete_id}:${s.kind}`, s.qty]))
  )

  function qtyOf(athleteId: string, k: ScoreKind) {
    return local[`${athleteId}:${k}`] ?? 0
  }

  function bump(athleteId: string, kind: ScoreKind, delta: number) {
    const next = Math.max(0, qtyOf(athleteId, kind) + delta)
    setLocal((prev) => ({ ...prev, [`${athleteId}:${kind}`]: next }))
    onSet(athleteId, kind, next)
  }

  function pointsOf(athleteId: string) {
    return SCORE_KINDS.reduce((n, k) => n + qtyOf(athleteId, k) * SCORE_POINTS[k], 0)
  }

  // In sola lettura si mostra solo chi ha segnato.
  const shown = readOnly ? members.filter((a) => pointsOf(a.id) > 0) : members

  const byKind = SCORE_KINDS.map((k) => ({
    kind: k,
    qty: members.reduce((n, a) => n + qtyOf(a.id, k), 0),
  }))
  const scored = byKind.reduce((n, b) => n + b.qty * SCORE_POINTS[b.kind], 0)
  const declared = game.points_for
  const gap = declared === null ? null : declared - scored

  return (
    <div className="mt-4">
      <ul className="panel rows">
        {shown.map((a) => {
          const total = pointsOf(a.id)

          return (
            <li key={a.id} className="scorer-row">
              <div className="flex items-baseline justify-between gap-2">
                <AthleteName athlete={a} />
                <span className="mini" data-on={total > 0}>
                  {total} punti
                </span>
              </div>

              <div className="score-grid">
                {SCORE_KINDS.map((k) => {
                  const n = qtyOf(a.id, k)
                  return (
                    <div key={k} className="score-cell">
                      <span className="mini">
                        {SCORE_SHORT[k]} · {SCORE_POINTS[k]}
                      </span>
                      <span className="stepper sm">
                        <button
                          type="button"
                          disabled={readOnly || pending || n === 0}
                          onClick={() => bump(a.id, k, -1)}
                          aria-label={`${SCORE_SHORT[k]} di ${fullName(a)}: meno uno`}
                        >
                          −
                        </button>
                        <b data-on={n > 0}>{n}</b>
                        <button
                          type="button"
                          disabled={readOnly || pending}
                          onClick={() => bump(a.id, k, 1)}
                          aria-label={`${SCORE_SHORT[k]} di ${fullName(a)}: più uno`}
                        >
                          +
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            </li>
          )
        })}

        {shown.length === 0 && (
          <li className="empty">
            {readOnly
              ? 'Nessuna marcatura in questo incontro.'
              : 'Nessun convocato in questa formazione: scegli prima i giocatori.'}
          </li>
        )}
      </ul>

      <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
        {byKind
          .map((b) => `${b.qty} ${SCORE_SHORT[b.kind].toLowerCase()}`)
          .join(' · ')}{' '}
        = <b style={{ color: 'var(--color-text)' }}>{scored} punti</b>
        {declared === null
          ? ' · risultato non ancora inserito'
          : gap === 0
            ? ' · quadra col risultato'
            : gap! > 0
              ? ` · ne mancano ${gap} rispetto ai ${declared} del risultato`
              : ` · ${-gap!} in più rispetto ai ${declared} del risultato`}
      </p>
    </div>
  )
}
