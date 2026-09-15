'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/utils/supabase/client'
import { setEventClosed } from '@/lib/actions/events'
import { AthleteName } from '@/components/athlete-name'
import { EVENT_LABEL, dayStamp, formatEventTime, fullName } from '@/lib/format'
import { enqueue, flush, pendingFor } from '@/lib/offline-queue'
import type { Athlete, Event } from '@/lib/types'

export function AttendanceBoard({
  event,
  athletes,
  initialAbsent,
  userId,
  lockedAthleteId = null,
  canClose = true,
}: {
  event: Event
  athletes: Athlete[]
  initialAbsent: { athlete_id: string; injury: boolean }[]
  userId: string
  /** Se valorizzato, in elenco compare solo questo giocatore: e' l'atleta
   *  che segna se stesso. I totali in testata restano quelli di squadra. */
  lockedAthleteId?: string | null
  /** Chiudere l'appello e' dello staff. */
  canClose?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [absent, setAbsent] = useState<Map<string, boolean>>(
    () => new Map(initialAbsent.map((a) => [a.athlete_id, a.injury]))
  )

  // Cio' che il server non ha ancora ricevuto vince su cio' che ha mandato:
  // altrimenti al ricarico le modifiche offline sembrerebbero sparite.
  useEffect(() => {
    const queued = pendingFor(event.id)
    if (queued.length === 0) return

    setAbsent((prev) => {
      const next = new Map(prev)
      for (const q of queued) {
        q.absent ? next.set(q.athlete_id, q.injury) : next.delete(q.athlete_id)
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
  const canEdit = canClose || !closed

  const present = athletes.length - absent.size
  const injured = [...absent.values()].filter(Boolean).length

  /**
   * Scrive lo stato voluto per un atleta. Se la rete non risponde la
   * modifica finisce in coda invece di essere annullata: a bordo campo
   * un rollback silenzioso e' peggio di un'attesa dichiarata.
   */
  async function persist(athleteId: string, isAbsent: boolean, injury: boolean) {
    if (!navigator.onLine) {
      enqueue({
        event_id: event.id,
        athlete_id: athleteId,
        absent: isAbsent,
        injury,
        marked_by: userId,
      })
      return
    }

    const { error } = isAbsent
      ? await supabase.from('absences').upsert(
          {
            event_id: event.id,
            athlete_id: athleteId,
            injury,
            marked_by: userId,
          },
          { onConflict: 'event_id,athlete_id' }
        )
      : await supabase
          .from('absences')
          .delete()
          .match({ event_id: event.id, athlete_id: athleteId })

    if (error) {
      enqueue({
        event_id: event.id,
        athlete_id: athleteId,
        absent: isAbsent,
        injury,
        marked_by: userId,
      })
    }
  }

  async function toggle(athleteId: string) {
    const wasAbsent = absent.has(athleteId)

    // Aggiorno subito: a bordo campo nessuno aspetta la rete.
    setAbsent((prev) => {
      const next = new Map(prev)
      wasAbsent ? next.delete(athleteId) : next.set(athleteId, false)
      return next
    })
    setFailed(null)

    await persist(athleteId, !wasAbsent, false)
  }

  /** L'infortunio e' un attributo dell'assenza, non un terzo stato. */
  async function toggleInjury(athleteId: string) {
    const next = !(absent.get(athleteId) ?? false)

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
      </div>

      <div className="panel-head">
        <span>
          <span className="mini">Presenti</span>
          <span className="mt-1 block text-2xl" style={{ color: 'var(--color-text)' }}>
            {present}
            <span style={{ color: 'var(--color-faint)' }}> / {athletes.length}</span>
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-2">
          {absent.size > 0 && (
            <span className="tag fail">
              {absent.size} {absent.size === 1 ? 'assente' : 'assenti'}
            </span>
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
        {!canEdit
          ? 'Appello chiuso: non è più modificabile'
          : lockedAthleteId
            ? 'Tocca il tuo nome se non ci sarai'
            : 'Tocca un nome per segnarlo assente'}
      </p>

      <ul className="rows">
        {visible.map((a) => {
          const isAbsent = absent.has(a.id)
          const isInjured = absent.get(a.id) ?? false
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => toggle(a.id)}
                disabled={!canEdit}
                aria-pressed={isAbsent}
                aria-label={`${fullName(a)}: ${isAbsent ? 'assente' : 'presente'}`}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                style={{
                  minHeight: '58px',
                  background: isAbsent ? 'rgba(255,68,51,.1)' : 'transparent',
                  boxShadow: isAbsent
                    ? 'inset 3px 0 0 0 var(--color-red)'
                    : 'none',
                  opacity: isAbsent ? 0.85 : 1,
                }}
              >
                <span
                  style={{
                    textDecoration: isAbsent ? 'line-through' : 'none',
                    textDecorationColor: 'var(--color-red)',
                  }}
                >
                  <AthleteName athlete={a} />
                </span>

                <span
                  className={isAbsent ? 'tag fail' : 'tag pass'}
                  style={{ flex: 'none' }}
                >
                  {isAbsent ? 'Assente' : 'Presente'}
                </span>
              </button>

              {isAbsent && (
                <div
                  className="flex flex-wrap items-center gap-3 px-4 pb-3"
                  style={{ background: 'var(--absent-bg)' }}
                >
                  <button
                    type="button"
                    className="pill"
                    data-on={isInjured}
                    disabled={!canEdit}
                    onClick={() => toggleInjury(a.id)}
                    aria-pressed={isInjured}
                  >
                    {isInjured ? '✓ Infortunato' : 'Segna infortunio'}
                  </button>
                  {isInjured && (
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      Resta un’assenza nelle percentuali, ma conteggiata a parte.
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
          {!canClose
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
            {closed ? 'Riapri appello' : 'Chiudi appello'}
          </button>
        )}
      </div>
    </section>
  )
}
