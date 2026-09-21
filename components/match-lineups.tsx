'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createLineup,
  deleteLineup,
  markTheRest,
  setLineupMembers,
  setScore,
  updateLineup,
} from '@/lib/actions/lineups'
import { AthleteName } from '@/components/athlete-name'
import { Busy } from '@/components/spinner'
import { formatEventTime, fullName, toLocalInputs } from '@/lib/format'
import {
  SCORE_KINDS,
  SCORE_LABEL,
  SCORE_ONE,
  SCORE_POINTS,
  type Athlete,
  type Event,
  type Lineup,
  type Score,
  type ScoreKind,
} from '@/lib/types'

export type LineupData = {
  lineup: Lineup
  memberIds: string[]
  scores: Score[]
}

type Panel = 'members' | 'scores' | 'edit'

/**
 * Le formazioni di una partita. Al concentramento se ne portano due o
 * tre sullo stesso campo: stesso avversario, orari diversi, convocati
 * diversi, risultati diversi. Un atleta sta in una sola: spostarlo da
 * un elenco all'altro lo toglie dal precedente.
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
  const [open, setOpen] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('members')
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  // La data della partita: gli orari delle formazioni si scrivono come
  // sola ora e la data gliela diamo noi, non si gioca in un altro giorno.
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

  /*
   * Fatte le squadre, chi resta fuori va segnato: o assente, e pesa sulle
   * percentuali, o non convocato, e la partita esce dai suoi conti. Non
   * succede da solo — le formazioni si preparano giorni prima, e nessuno
   * vuole trovarsi mezza rosa segnata assente prima ancora di giocare.
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

  // Dove si trova ogni atleta: serve a dirlo nel selettore dell'altra.
  const lineupOf = new Map<string, string>()
  for (const l of lineups) {
    for (const id of l.memberIds) lineupOf.set(id, l.lineup.name)
  }

  const assigned = lineupOf.size

  return (
    <section className="panel mt-5">
      <Busy show={isPending} />

      <div className="panel-head">
        <span>
          <span className="mini">Formazioni</span>
          <span className="mt-1 block" style={{ color: 'var(--color-text)' }}>
            {lineups.length === 0
              ? 'Nessuna'
              : `${lineups.length} · ${assigned} convocati`}
          </span>
        </span>

        {canEdit && (
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
          <input
            type="hidden"
            name="sort"
            value={(lineups.length + 1) * 10}
          />

          <div className="grid-2">
            <label className="field">
              <span>Nome</span>
              <input name="name" placeholder="es. Squadra A" required />
            </label>
            <label className="field">
              <span>Inizio</span>
              <input name="time" type="time" />
            </label>
            <label className="field">
              <span>Ritrovo</span>
              <input name="meet_time" type="time" />
            </label>
            <label className="field">
              <span>Avversario</span>
              <input name="opponent" placeholder={event.opponent ?? 'come la partita'} />
            </label>
          </div>

          <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
            Orario e avversario lasciati vuoti seguono quelli della partita.
          </p>

          <button type="submit" className="btn btn-sm btn-primary mt-4" disabled={isPending}>
            Crea formazione
          </button>
        </form>
      )}

      {lineups.length === 0 ? (
        <p className="empty">
          {canEdit
            ? 'Senza formazioni la partita funziona come prima: appello su tutta la squadra, e niente risultato né marcature. Creane una per dividere i convocati, dare un orario a ciascuna e segnare chi va in meta.'
            : 'Nessuna formazione per questa partita.'}
        </p>
      ) : (
        <ul className="rows" style={{ borderTop: '1px solid var(--color-line)' }}>
          {lineups.map((data) => {
            const l = data.lineup
            const isOpen = open === l.id
            const members = athletes.filter((a) => data.memberIds.includes(a.id))
            const points = data.scores.reduce(
              (n, s) => n + s.qty * SCORE_POINTS[s.kind],
              0
            )

            return (
              <li key={l.id} className="row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="nm">{l.name}</span>

                  <span className="flex flex-wrap gap-2">
                    {l.points_for !== null && l.points_against !== null ? (
                      <span
                        className={
                          l.points_for > l.points_against
                            ? 'tag pass'
                            : l.points_for < l.points_against
                              ? 'tag fail'
                              : 'tag warn'
                        }
                      >
                        {l.points_for} – {l.points_against}
                      </span>
                    ) : (
                      <span className="tag">Risultato da inserire</span>
                    )}
                    <span className="tag">{data.memberIds.length} convocati</span>
                  </span>
                </div>

                <p className="mt-1.5 text-sm" style={{ color: 'var(--color-muted)' }}>
                  {formatEventTime(l.starts_at ?? event.starts_at)}
                  {l.meet_at && ` · ritrovo ${formatEventTime(l.meet_at)}`}
                  {(l.opponent || event.opponent) &&
                    ` · vs ${l.opponent ?? event.opponent}`}
                  {points > 0 && ` · ${points} punti dai marcatori`}
                </p>

                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setError(null)
                      setPanel('members')
                      setOpen(isOpen && panel === 'members' ? null : l.id)
                    }}
                  >
                    {canEdit ? 'Convocati' : 'Vedi i convocati'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setError(null)
                      setPanel('scores')
                      setOpen(isOpen && panel === 'scores' ? null : l.id)
                    }}
                  >
                    Marcature
                  </button>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setError(null)
                          setPanel('edit')
                          setOpen(isOpen && panel === 'edit' ? null : l.id)
                        }}
                      >
                        Risultato e orario
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Eliminare la formazione “${l.name}”? Spariscono convocati e marcature, le presenze della partita restano.`
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

                {isOpen && panel === 'members' && (
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

                {isOpen && panel === 'scores' && (
                  <ScoreBoard
                    lineup={l}
                    members={members}
                    scores={data.scores}
                    pending={isPending}
                    readOnly={!canEdit}
                    onSet={(athleteId, kind, qty) =>
                      run(() => setScore(l.id, athleteId, kind, qty))
                    }
                  />
                )}

                {isOpen && panel === 'edit' && canEdit && (
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
                        <span>Avversario</span>
                        <input
                          name="opponent"
                          defaultValue={l.opponent ?? ''}
                          placeholder={event.opponent ?? 'come la partita'}
                        />
                      </label>
                      <label className="field">
                        <span>Inizio</span>
                        <input
                          name="time"
                          type="time"
                          defaultValue={l.starts_at ? toLocalInputs(l.starts_at).time : ''}
                        />
                      </label>
                      <label className="field">
                        <span>Ritrovo</span>
                        <input
                          name="meet_time"
                          type="time"
                          defaultValue={l.meet_at ? toLocalInputs(l.meet_at).time : ''}
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
                          defaultValue={l.points_for ?? ''}
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
                          defaultValue={l.points_against ?? ''}
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
            giocatore sta in una squadra sola.
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
 * Le marcature. Si sceglie il tipo in cima e poi si tocca il + a fianco
 * del nome: a bordo campo non c'e' tempo per un menu per giocatore.
 * Il totale in fondo dice se i punti dei marcatori quadrano col risultato.
 */
function ScoreBoard({
  lineup,
  members,
  scores,
  pending,
  readOnly,
  onSet,
}: {
  lineup: Lineup
  members: Athlete[]
  scores: Score[]
  pending: boolean
  readOnly: boolean
  onSet: (athleteId: string, kind: ScoreKind, qty: number) => void
}) {
  const [kind, setKind] = useState<ScoreKind>('try')

  // Copia locale: il + deve rispondere subito, la riscrittura arriva dopo.
  const [local, setLocal] = useState<Record<string, number>>(() =>
    Object.fromEntries(scores.map((s) => [`${s.athlete_id}:${s.kind}`, s.qty]))
  )

  function qtyOf(athleteId: string, k: ScoreKind) {
    return local[`${athleteId}:${k}`] ?? 0
  }

  function bump(athleteId: string, delta: number) {
    const next = Math.max(0, qtyOf(athleteId, kind) + delta)
    setLocal((prev) => ({ ...prev, [`${athleteId}:${kind}`]: next }))
    onSet(athleteId, kind, next)
  }

  const totals = members.map((a) => ({
    athlete: a,
    points: SCORE_KINDS.reduce((n, k) => n + qtyOf(a.id, k) * SCORE_POINTS[k], 0),
  }))

  const scored = totals.reduce((n, t) => n + t.points, 0)
  const declared = lineup.points_for
  const gap = declared === null ? null : declared - scored

  return (
    <div className="mt-4">
      <p className="mini mb-2">Stai segnando</p>

      <div className="filters mb-3">
        {SCORE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="pill"
            data-on={kind === k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
          >
            {SCORE_LABEL[k]} · {SCORE_POINTS[k]}
          </button>
        ))}
      </div>

      <ul className="panel rows">
        {members.map((a) => {
          const n = qtyOf(a.id, kind)
          const total = totals.find((t) => t.athlete.id === a.id)?.points ?? 0

          return (
            <li key={a.id} className="scorer">
              <span>
                <AthleteName athlete={a} />
                {total > 0 && (
                  <span className="mini block">{total} punti in totale</span>
                )}
              </span>

              <span className="stepper">
                <button
                  type="button"
                  disabled={readOnly || pending || n === 0}
                  onClick={() => bump(a.id, -1)}
                  aria-label={`Togli una ${SCORE_ONE[kind]} a ${fullName(a)}`}
                >
                  −
                </button>
                <b data-on={n > 0}>{n}</b>
                <button
                  type="button"
                  disabled={readOnly || pending}
                  onClick={() => bump(a.id, 1)}
                  aria-label={`Aggiungi una ${SCORE_ONE[kind]} a ${fullName(a)}`}
                >
                  +
                </button>
              </span>
            </li>
          )
        })}

        {members.length === 0 && (
          <li className="empty">
            Nessun convocato in questa formazione: scegli prima i giocatori.
          </li>
        )}
      </ul>

      <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
        {scored} punti dai marcatori
        {declared === null
          ? ' · risultato finale non ancora inserito'
          : gap === 0
            ? ' · quadra col risultato'
            : gap! > 0
              ? ` · ne mancano ${gap} rispetto ai ${declared} del risultato`
              : ` · ${-gap!} in più rispetto ai ${declared} del risultato`}
      </p>
    </div>
  )
}
