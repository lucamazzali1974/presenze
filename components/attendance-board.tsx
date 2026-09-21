'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/utils/supabase/client'
import { setEventClosed } from '@/lib/actions/events'
import { AthleteName } from '@/components/athlete-name'
import { EVENT_LABEL, dayStamp, formatEventTime, fullName } from '@/lib/format'
import { mapsUrl } from '@/lib/maps'
import { Busy, Spinner } from '@/components/spinner'
import { enqueue, flush, pendingFor } from '@/lib/offline-queue'
import type { Athlete, Event } from '@/lib/types'

type AbsenceFlags = { injury: boolean; not_called: boolean }

/** Assenza semplice: nessuno dei due attributi. */
const NONE: AbsenceFlags = { injury: false, not_called: false }

export function AttendanceBoard({
  event,
  athletes,
  initialAbsent,
  userId,
  lockedAthleteId = null,
  canClose = true,
  canMark = true,
}: {
  event: Event
  athletes: Athlete[]
  initialAbsent: { athlete_id: string; injury: boolean; not_called: boolean }[]
  userId: string
  /** Se valorizzato, in elenco compare solo questo giocatore: e' l'atleta
   *  che segna se stesso. I totali in testata restano quelli di squadra. */
  lockedAthleteId?: string | null
  /** Chiudere l'appello e' dello staff. */
  canClose?: boolean
  /** 'Appello' in modifica nella matrice dei permessi: senza, sola lettura. */
  canMark?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])

  /*
   * Un'assenza ha due attributi che si escludono: l'infortunio (resta
   * un'assenza, contata a parte) e il "non convocato" (l'evento esce
   * proprio dai conti di quel giocatore).
   */
  const [absent, setAbsent] = useState<Map<string, AbsenceFlags>>(
    () =>
      new Map(
        initialAbsent.map((a) => [
          a.athlete_id,
          { injury: a.injury, not_called: a.not_called },
        ])
      )
  )

  // Cio' che il server non ha ancora ricevuto vince su cio' che ha mandato:
  // altrimenti al ricarico le modifiche offline sembrerebbero sparite.
  useEffect(() => {
    const queued = pendingFor(event.id)
    if (queued.length === 0) return

    setAbsent((prev) => {
      const next = new Map(prev)
      for (const q of queued) {
        q.absent
          ? next.set(q.athlete_id, { injury: q.injury, not_called: q.not_called })
          : next.delete(q.athlete_id)
      }
      return next
    })

    if (navigator.onLine) flush(supabase)
  }, [event.id, supabase])
  const [failed, setFailed] = useState<string | null>(null)
  const [closed, setClosed] = useState(Boolean(event.closed_at))
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  const mine = lockedAthleteId
    ? athletes.filter((a) => a.id === lockedAthleteId)
    : athletes

  const visible = query.trim()
    ? mine.filter((a) =>
        `${a.first_name} ${a.last_name} ${a.nickname ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : mine

  /*
   * Ad appello chiuso l'atleta non puo' piu' scrivere: lo impone la RLS.
   * Va impedito anche qui, perche' persist() in caso di errore mette la
   * modifica in coda offline: un rifiuto di permessi resterebbe in coda
   * per sempre, riprovato ogni 30 secondi e mai accettato.
   */
  const canEdit = canMark && (canClose || !closed)

  /*
   * I non convocati escono dal denominatore: "18 presenti su 20" con due
   * giocatori che nessuno aspettava non vuol dire niente.
   */
  const uncalled = [...absent.values()].filter((f) => f.not_called).length
  const expected = athletes.length - uncalled
  const missing = absent.size - uncalled
  const present = expected - missing
  const injured = [...absent.values()].filter((f) => f.injury).length

  /**
   * Scrive lo stato voluto per un atleta. Se la rete non risponde la
   * modifica finisce in coda invece di essere annullata: a bordo campo
   * un rollback silenzioso e' peggio di un'attesa dichiarata.
   */
  async function persist(
    athleteId: string,
    isAbsent: boolean,
    flags: AbsenceFlags
  ) {
    const queued = {
      event_id: event.id,
      athlete_id: athleteId,
      absent: isAbsent,
      injury: flags.injury,
      not_called: flags.not_called,
      marked_by: userId,
    }

    if (!navigator.onLine) {
      enqueue(queued)
      return
    }

    const { error } = isAbsent
      ? await supabase.from('absences').upsert(
          {
            event_id: event.id,
            athlete_id: athleteId,
            injury: flags.injury,
            not_called: flags.not_called,
            marked_by: userId,
          },
          { onConflict: 'event_id,athlete_id' }
        )
      : await supabase
          .from('absences')
          .delete()
          .match({ event_id: event.id, athlete_id: athleteId })

    if (error) enqueue(queued)
  }

  async function toggle(athleteId: string) {
    const wasAbsent = absent.has(athleteId)

    // Aggiorno subito: a bordo campo nessuno aspetta la rete.
    setAbsent((prev) => {
      const next = new Map(prev)
      wasAbsent ? next.delete(athleteId) : next.set(athleteId, NONE)
      return next
    })
    setFailed(null)

    await persist(athleteId, !wasAbsent, NONE)
  }

  /**
   * Infortunio e "non convocato" sono attributi dell'assenza, non due
   * terzi stati, e non stanno insieme: accenderne uno spegne l'altro.
   */
  async function setFlag(athleteId: string, flag: keyof AbsenceFlags) {
    const current = absent.get(athleteId) ?? NONE
    const next: AbsenceFlags = current[flag]
      ? NONE
      : { injury: flag === 'injury', not_called: flag === 'not_called' }

    setAbsent((prev) => new Map(prev).set(athleteId, next))
    setFailed(null)

    await persist(athleteId, true, next)
  }

  function toggleClosed() {
    startTransition(async () => {
      const next = !closed
      setClosed(next)
      const res = await setEventClosed(event.id, next)
      if (res?.error) {
        setClosed(!next)
        setFailed(res.error)
      }
    })
  }

  return (
    <section className="panel mt-5">
      <Busy show={isPending} label="Aggiorno l’appello…" />

      {/* Ripete l'evento: sotto la lista dei nomi non si deve mai
          dover risalire per capire cosa si sta compilando. */}
      <div className="board-id">
        <span className="flex flex-wrap items-center gap-2">
          <span className={event.type === 'match' ? 'tag info' : 'tag'}>
            {EVENT_LABEL[event.type]}
          </span>
          <span className="mini">Appello in corso</span>
        </span>

        <p className="board-title">
          {event.opponent
            ? `vs ${event.opponent}`
            : event.title || EVENT_LABEL[event.type]}
        </p>

        <p className="board-meta">
          {dayStamp(event.starts_at)} · {formatEventTime(event.starts_at)}
          {event.meet_at ? ` · ritrovo ${formatEventTime(event.meet_at)}` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>

        {event.type === 'match' && mapsUrl(event.address, event.location) && (
          <a
            className="btn btn-sm mt-3"
            href={mapsUrl(event.address, event.location)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apri in Maps
          </a>
        )}
      </div>

      <div className="panel-head">
        <span>
          <span className="mini">Presenti</span>
          <span className="mt-1 block text-2xl" style={{ color: 'var(--color-text)' }}>
            {present}
            <span style={{ color: 'var(--color-faint)' }}> / {expected}</span>
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2">
          {missing > 0 && (
            <span className="tag fail">
              {missing} {missing === 1 ? 'assente' : 'assenti'}
            </span>
          )}
          {uncalled > 0 && (
            <span className="tag">{uncalled} non convocati</span>
          )}
          {injured > 0 && (
            <span className="tag warn">
              {injured} {injured === 1 ? 'infortunio' : 'infortuni'}
            </span>
          )}
          <span className={closed ? 'tag pass' : 'tag warn'}>
            {closed ? 'Appello chiuso' : 'Da chiudere'}
          </span>
        </span>
      </div>

      {!lockedAthleteId && mine.length > 10 && (
        <div className="border-b border-line p-4">
          <input
            className="search"
            placeholder="Cerca un giocatore"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cerca un giocatore"
          />
        </div>
      )}

      {failed && (
        <div className="border-b border-line p-4">
          <p className="alert">{failed}</p>
        </div>
      )}

      <p className="mini border-b border-line px-4 py-2">
        {!canMark
          ? 'Hai accesso in sola lettura a questo appello'
          : !canEdit
            ? 'Appello chiuso: non è più modificabile'
            : lockedAthleteId
              ? 'Tocca il tuo nome se non ci sarai'
              : 'Tocca un nome per segnarlo assente'}
      </p>

      <ul className="rows">
        {visible.map((a) => {
          const flags = absent.get(a.id)
          const isAbsent = Boolean(flags)
          const isInjured = flags?.injury ?? false
          const isUncalled = flags?.not_called ?? false
          // Il non convocato non e' un'assenza da evidenziare in rosso:
          // e' qualcuno che nessuno stava aspettando.
          const marked = isAbsent && !isUncalled
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => toggle(a.id)}
                disabled={!canEdit}
                aria-pressed={isAbsent}
                aria-label={`${fullName(a)}: ${
                  isUncalled ? 'non convocato' : isAbsent ? 'assente' : 'presente'
                }`}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                style={{
                  minHeight: '58px',
                  background: marked ? 'rgba(255,68,51,.1)' : 'transparent',
                  boxShadow: marked ? 'inset 3px 0 0 0 var(--color-red)' : 'none',
                  opacity: isAbsent ? (isUncalled ? 0.6 : 0.85) : 1,
                }}
              >
                <span
                  style={{
                    textDecoration: marked ? 'line-through' : 'none',
                    textDecorationColor: 'var(--color-red)',
                  }}
                >
                  <AthleteName athlete={a} />
                </span>

                <span
                  className={isUncalled ? 'tag' : isAbsent ? 'tag fail' : 'tag pass'}
                  style={{ flex: 'none' }}
                >
                  {isUncalled ? 'Non convocato' : isAbsent ? 'Assente' : 'Presente'}
                </span>
              </button>

              {isAbsent && (
                <div
                  className="flex flex-wrap items-center gap-3 px-4 pb-3"
                  style={{ background: marked ? 'var(--absent-bg)' : 'transparent' }}
                >
                  <button
                    type="button"
                    className="pill"
                    data-on={isInjured}
                    disabled={!canEdit}
                    onClick={() => setFlag(a.id, 'injury')}
                    aria-pressed={isInjured}
                  >
                    {isInjured ? '✓ Infortunato' : 'Segna infortunio'}
                  </button>

                  {/* Il "non convocato" lo decide chi fa le convocazioni:
                      all'atleta non si da' il modo di togliersi dai conti. */}
                  {canClose && (
                    <button
                      type="button"
                      className="pill"
                      data-on={isUncalled}
                      disabled={!canEdit}
                      onClick={() => setFlag(a.id, 'not_called')}
                      aria-pressed={isUncalled}
                    >
                      {isUncalled ? '✓ Non convocato' : 'Non convocato'}
                    </button>
                  )}

                  {(isInjured || isUncalled) && (
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      {isInjured
                        ? 'Resta un’assenza nelle percentuali, ma conteggiata a parte.'
                        : 'Questo evento esce dalle sue percentuali: né presenza né assenza.'}
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}

        {visible.length === 0 && (
          <li className="empty">
            {lockedAthleteId
              ? 'Non sei tra i convocati di questo evento.'
              : 'Nessun giocatore trovato.'}
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)', maxWidth: '22rem' }}>
          {!canMark
            ? 'Stai guardando l’appello: per modificarlo serve il permesso «Appello: modifica».'
            : !canClose
            ? closed
              ? 'L’appello è stato chiuso dall’allenatore: la tua presenza è registrata.'
              : 'Puoi cambiare idea finché l’allenatore non chiude l’appello.'
            : closed
              ? 'L’appello è chiuso e conta nelle percentuali.'
              : 'Chiudi l’appello quando hai finito: solo così entra nelle percentuali.'}
        </p>
        {canClose && (
          <button
            type="button"
            onClick={toggleClosed}
            disabled={isPending}
            className={closed ? 'btn' : 'btn btn-primary'}
          >
            {isPending ? (
              <Spinner label="Attendi…" />
            ) : closed ? (
              'Riapri appello'
            ) : (
              'Chiudi appello'
            )}
          </button>
        )}
      </div>
    </section>
  )
}
