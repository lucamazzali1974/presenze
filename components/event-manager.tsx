'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import {
  createEvent,
  createRecurringEvents,
  deleteEvent,
  deleteSeries,
  updateEvent,
} from '@/lib/actions/events'
import {
  EVENT_LABEL,
  dayStamp,
  formatEventTime,
  monthLabel,
  toLocalInputs,
} from '@/lib/format'
import type { Event, Team } from '@/lib/types'

const WEEKDAYS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mer'],
  [4, 'Gio'],
  [5, 'Ven'],
  [6, 'Sab'],
  [7, 'Dom'],
] as const

export function EventManager({
  upcoming,
  past,
  teams,
}: {
  upcoming: Event[]
  past: Event[]
  teams: Team[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<'single' | 'recurring'>('single')
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming')
  const [filter, setFilter] = useState<'all' | 'training' | 'match'>('all')
  const [team, setTeam] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const singleRef = useRef<HTMLFormElement>(null)
  const recurringRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()

  const teamName = new Map(teams.map((t) => [t.id, t.name]))
  const activeTeams = teams.filter((t) => t.active)

  function submitSingle(formData: FormData) {
    startTransition(async () => {
      const res = await createEvent(formData)
      if (res?.error) return setError(res.error)
      setError(null)
      singleRef.current?.reset()
      setShowForm(false)
    })
  }

  function submitRecurring(formData: FormData) {
    startTransition(async () => {
      const res = await createRecurringEvents(formData)
      if (res?.error) return setError(res.error)
      setError(null)
      recurringRef.current?.reset()
      setShowForm(false)
    })
  }

  const source = when === 'upcoming' ? upcoming : past
  const needle = query.trim().toLowerCase()

  const list = source.filter((e) => {
    if (filter !== 'all' && e.type !== filter) return false
    // "Senza squadra" e' un filtro a se': quegli eventi valgono per tutti.
    if (team === 'none' && e.team_id !== null) return false
    if (team !== 'all' && team !== 'none' && e.team_id !== team) return false
    if (!needle) return true
    return `${e.title ?? ''} ${e.location ?? ''} ${EVENT_LABEL[e.type]} ${
      e.team_id ? (teamName.get(e.team_id) ?? '') : ''
    } ${dayStamp(e.starts_at)}`
      .toLowerCase()
      .includes(needle)
  })

  // Raggruppo per mese: scorrere una stagione intera senza appigli e' illeggibile.
  const groups: { label: string; events: Event[] }[] = []
  for (const e of list) {
    const label = monthLabel(e.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(e)
    else groups.push({ label, events: [e] })
  }

  const nextId = when === 'upcoming' ? list[0]?.id : undefined

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Calendario</p>
        <h1 className="h1">Allenamenti e partite</h1>
        <p className="sub">
          {upcoming.length} in programma · {past.length} già passati
        </p>

        <button
          type="button"
          className="btn btn-primary mt-5"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? 'Annulla' : 'Aggiungi date'}
        </button>
      </div>

      {showForm && (
        <div className="panel mb-4">
          <div className="flex gap-2 border-b border-line p-4">
            <button
              type="button"
              className="pill"
              data-on={mode === 'single'}
              onClick={() => setMode('single')}
            >
              Data singola
            </button>
            <button
              type="button"
              className="pill"
              data-on={mode === 'recurring'}
              onClick={() => setMode('recurring')}
            >
              Ogni settimana
            </button>
          </div>

          {mode === 'single' ? (
            <form ref={singleRef} action={submitSingle} className="p-4">
              <div className="grid-2">
                <label className="field">
                  <span>Tipo</span>
                  <select name="type">
                    <option value="training">Allenamento</option>
                    <option value="match">Partita</option>
                  </select>
                </label>
                <label className="field">
                  <span>Luogo</span>
                  <input name="location" placeholder="es. Campo comunale" />
                </label>
                <label className="field">
                  <span>Squadra</span>
                  <select name="team_id" defaultValue="">
                    <option value="">Tutta la societ&agrave;</option>
                    {activeTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Data</span>
                  <input name="date" type="date" required />
                </label>
                <label className="field">
                  <span>Ora</span>
                  <input name="time" type="time" required />
                </label>
                <label className="field">
                  <span>Titolo</span>
                  <input name="title" placeholder="facoltativo" />
                </label>
              </div>

              <button type="submit" className="btn btn-primary mt-5" disabled={isPending}>
                Aggiungi in calendario
              </button>
            </form>
          ) : (
            <form ref={recurringRef} action={submitRecurring} className="p-4">
              <div className="grid-2">
                <label className="field">
                  <span>Tipo</span>
                  <select name="type">
                    <option value="training">Allenamento</option>
                    <option value="match">Partita</option>
                  </select>
                </label>
                <label className="field">
                  <span>Luogo</span>
                  <input name="location" />
                </label>
                <label className="field">
                  <span>Squadra</span>
                  <select name="team_id" defaultValue="">
                    <option value="">Tutta la societ&agrave;</option>
                    {activeTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Ora</span>
                  <input name="time" type="time" required />
                </label>
                <label className="field">
                  <span>Titolo</span>
                  <input name="title" placeholder="facoltativo" />
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

              <fieldset className="mt-5">
                <legend className="mini mb-2">Giorni della settimana</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(([value, label]) => (
                    <label key={value} className="day">
                      <input
                        type="checkbox"
                        name="weekdays"
                        value={value}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button type="submit" className="btn btn-primary mt-5" disabled={isPending}>
                Genera le date
              </button>
            </form>
          )}
        </div>
      )}

      {error && <p className="alert mb-4">{error}</p>}

      <div className="filters mb-3">
        <button
          type="button"
          className="pill"
          data-on={when === 'upcoming'}
          onClick={() => setWhen('upcoming')}
        >
          In programma
        </button>
        <button
          type="button"
          className="pill"
          data-on={when === 'past'}
          onClick={() => setWhen('past')}
        >
          Passati
        </button>

        <span
          aria-hidden="true"
          style={{
            width: '1px',
            background: 'var(--color-line)',
            margin: '0 4px',
            flex: 'none',
          }}
        />

        {(
          [
            ['all', 'Tutti'],
            ['training', 'Allenamenti'],
            ['match', 'Partite'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="pill"
            data-on={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {teams.length > 0 && (
        <div className="filters mb-3">
          {(
            [
              ['all', 'Tutte le squadre'],
              ...teams.map((t) => [t.id, t.name] as [string, string]),
              ['none', 'Senza squadra'],
            ] as [string, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="pill"
              data-on={team === key}
              onClick={() => setTeam(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        <input
          className="search"
          placeholder="Cerca per titolo, luogo o data"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca un evento"
        />
      </div>

      {groups.map((group) => (
        <section key={group.label} className="mb-4">
          <p className="mini mb-2">{group.label}</p>

          <ul className="panel rows">
            {group.events.map((e) => (
              <li key={e.id} className="row">
                {editing === e.id ? (
                  <EditForm
                    event={e}
                    teams={teams}
                    pending={isPending}
                    error={editing === e.id ? error : null}
                    onCancel={() => {
                      setError(null)
                      setEditing(null)
                    }}
                    onSubmit={(formData) => {
                      startTransition(async () => {
                        const res = await updateEvent(e.id, formData)
                        if (res?.error) return setError(res.error)
                        setError(null)
                        setEditing(null)
                      })
                    }}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        style={{ color: 'var(--color-text)', fontWeight: 500 }}
                      >
                        {e.title || EVENT_LABEL[e.type]}
                      </span>

                      <span className="flex flex-wrap gap-2">
                        {e.id === nextId && <span className="tag fail">Prossimo</span>}
                        <span className={e.type === 'match' ? 'tag info' : 'tag'}>
                          {EVENT_LABEL[e.type]}
                        </span>
                        <span className="tag">
                          {e.team_id
                            ? (teamName.get(e.team_id) ?? 'Squadra rimossa')
                            : 'Tutta la società'}
                        </span>
                        <span className={e.closed_at ? 'tag pass' : 'tag warn'}>
                          {e.closed_at ? 'Chiuso' : 'Da chiudere'}
                        </span>
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm">
                      <span style={{ color: 'var(--color-par)' }}>
                        {dayStamp(e.starts_at)} · {formatEventTime(e.starts_at)}
                      </span>
                      {e.location && (
                        <span style={{ color: 'var(--color-muted)' }}>
                          {' '}
                          · {e.location}
                        </span>
                      )}
                      {e.series_id && (
                        <span style={{ color: 'var(--color-faint)' }}>
                          {' '}
                          · ricorrente
                        </span>
                      )}
                    </p>

                    <div className="row-actions">
                      <Link href={`/events/${e.id}`} className="btn btn-sm">
                        Apri appello
                      </Link>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setError(null)
                          setEditing(e.id)
                        }}
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={isPending}
                        onClick={() => {
                          if (confirm('Eliminare questa data?')) {
                            startTransition(() => {
                              deleteEvent(e.id)
                            })
                          }
                        }}
                      >
                        Elimina
                      </button>
                      {e.series_id && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={isPending}
                          onClick={() => {
                            if (
                              confirm(
                                'Eliminare tutte le date future di questa serie? Quelle passate restano.'
                              )
                            ) {
                              startTransition(() => {
                                deleteSeries(e.series_id!)
                              })
                            }
                          }}
                        >
                          Tutta la serie
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {list.length === 0 && (
        <div className="panel">
          <p className="empty">
            {source.length === 0
              ? when === 'upcoming'
                ? 'Nessuna data in programma. Aggiungi la prima qui sopra.'
                : 'Nessuna data passata.'
              : 'Nessun risultato per questi filtri.'}
          </p>
        </div>
      )}
    </main>
  )
}

function EditForm({
  event,
  teams,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  event: Event
  teams: Team[]
  pending: boolean
  error?: string | null
  onSubmit: (formData: FormData) => void
  onCancel: () => void
}) {
  const { date, time } = toLocalInputs(event.starts_at)

  return (
    <form action={onSubmit}>
      <div className="grid-2">
        <label className="field">
          <span>Tipo</span>
          <select name="type" defaultValue={event.type}>
            <option value="training">Allenamento</option>
            <option value="match">Partita</option>
          </select>
        </label>
        <label className="field">
          <span>Luogo</span>
          <input name="location" defaultValue={event.location ?? ''} />
        </label>
        <label className="field">
          <span>Squadra</span>
          <select name="team_id" defaultValue={event.team_id ?? ''}>
            <option value="">Tutta la societ&agrave;</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.active ? '' : ' (non attiva)'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Data</span>
          <input name="date" type="date" defaultValue={date} required />
        </label>
        <label className="field">
          <span>Ora</span>
          <input name="time" type="time" defaultValue={time} required />
        </label>
        <label className="field">
          <span>Titolo</span>
          <input name="title" defaultValue={event.title ?? ''} />
        </label>
      </div>

      {error && <p className="alert mt-3">{error}</p>}

      <div className="row-actions">
        <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
          Salva
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Annulla
        </button>
      </div>

      {event.series_id && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
          La modifica vale solo per questa data, non per tutta la serie.
        </p>
      )}
    </form>
  )
}
