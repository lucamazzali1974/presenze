'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createTeam,
  deleteTeam,
  renameTeam,
  setTeamMembers,
  toggleTeamActive,
} from '@/lib/actions/teams'
import { AthleteName } from '@/components/athlete-name'
import type { Athlete, Team, TeamMember } from '@/lib/types'
import { Busy } from '@/components/spinner'

export function TeamManager({
  teams,
  athletes,
  members,
  eventCount,
  loadError = null,
  canEdit = true,
}: {
  teams: Team[]
  athletes: Athlete[]
  members: TeamMember[]
  eventCount: Record<string, number>
  loadError?: string | null
  /** Con 'Squadre' in sola lettura la pagina si vede, i comandi no. */
  canEdit?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [roster, setRoster] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const byTeam = new Map<string, Set<string>>()
  for (const m of members) {
    const set = byTeam.get(m.team_id) ?? new Set<string>()
    set.add(m.athlete_id)
    byTeam.set(m.team_id, set)
  }

  function run(fn: () => Promise<{ error?: string } | undefined>, done?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (res?.error) return setError(res.error)
      setError(null)
      done?.()
    })
  }

  const senzaSquadra = eventCount['none'] ?? 0

  return (
    <main className="wrap pb-16">
      <Busy show={isPending} />

      <div className="page-head">
        <p className="eyebrow">// Societ&agrave;</p>
        <h1 className="h1">Squadre</h1>
        <p className="sub">
          Un giocatore pu&ograve; stare in pi&ugrave; squadre. Un allenamento o una
          partita senza squadra vale per tutti.
        </p>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => {
              setError(null)
              setShowForm((v) => !v)
            }}
          >
            {showForm ? 'Annulla' : 'Aggiungi squadra'}
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form
          ref={formRef}
          action={(formData) =>
            run(() => createTeam(formData), () => {
              formRef.current?.reset()
              setShowForm(false)
            })
          }
          className="panel mb-4 p-4"
        >
          <label className="field">
            <span>Nome</span>
            <input name="name" placeholder="es. Under 18" required />
          </label>

          <button type="submit" className="btn btn-primary mt-5" disabled={isPending}>
            Salva squadra
          </button>
        </form>
      )}

      {loadError && (
        <p className="alert mb-4">Non sono riuscito a leggere le squadre: {loadError}</p>
      )}
      {error && <p className="alert mb-4">{error}</p>}

      {senzaSquadra > 0 && (
        <p className="panel mb-4 p-4 text-sm" style={{ color: 'var(--faint)' }}>
          {senzaSquadra}{' '}
          {senzaSquadra === 1 ? 'evento non ha' : 'eventi non hanno'} una squadra:
          valgono per tutta la rosa. Assegnali dal Calendario quando vuoi.
        </p>
      )}

      <ul className="panel rows">
        {teams.map((t) => {
          const rosterSet = byTeam.get(t.id) ?? new Set<string>()

          return (
            <li key={t.id} className="row">
              {editing === t.id && canEdit ? (
                <form
                  action={(formData) =>
                    run(() => renameTeam(t.id, formData), () => setEditing(null))
                  }
                >
                  <label className="field">
                    <span>Nome</span>
                    <input name="name" defaultValue={t.name} required />
                  </label>

                  <div className="row-actions">
                    <button type="submit" className="btn btn-sm btn-primary" disabled={isPending}>
                      Salva
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                      Annulla
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div
                    className="flex flex-wrap items-center justify-between gap-2"
                    style={{ opacity: t.active ? 1 : 0.5 }}
                  >
                    <span className="nm">{t.name}</span>
                    {!t.active && <span className="tag">Non attiva</span>}
                  </div>

                  <p className="mini mt-2">
                    {rosterSet.size} in rosa · {eventCount[t.id] ?? 0} eventi
                  </p>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setError(null)
                        setRoster(roster === t.id ? null : t.id)
                      }}
                    >
                      {roster === t.id
                        ? 'Chiudi rosa'
                        : canEdit
                          ? 'Gestisci rosa'
                          : 'Vedi la rosa'}
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setError(null)
                            setEditing(t.id)
                          }}
                        >
                          Rinomina
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={isPending}
                          onClick={() => run(() => toggleTeamActive(t.id, !t.active))}
                        >
                          {t.active ? 'Disattiva' : 'Riattiva'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Eliminare ${t.name}? Gli atleti restano, e i suoi eventi tornano validi per tutta la rosa. Le presenze gia' registrate non si toccano.`
                              )
                            ) {
                              run(() => deleteTeam(t.id))
                            }
                          }}
                        >
                          Elimina
                        </button>
                      </>
                    )}
                  </div>

                  {roster === t.id && (
                    <RosterPicker
                      athletes={athletes}
                      selected={rosterSet}
                      pending={isPending}
                      readOnly={!canEdit}
                      onSave={(ids) =>
                        run(() => setTeamMembers(t.id, ids), () => setRoster(null))
                      }
                    />
                  )}
                </>
              )}
            </li>
          )
        })}

        {teams.length === 0 && (
          <li className="empty">
            Nessuna squadra. Finché non ne crei una, tutti gli eventi valgono per
            tutta la rosa e l&rsquo;app funziona esattamente come prima.
          </li>
        )}
      </ul>
    </main>
  )
}

function RosterPicker({
  athletes,
  selected,
  pending,
  onSave,
  readOnly = false,
}: {
  athletes: Athlete[]
  selected: Set<string>
  pending: boolean
  onSave: (ids: string[]) => void
  readOnly?: boolean
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected))

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="mt-4">
      <p className="mini mb-2">Chi fa parte di questa squadra</p>

      <div className="flex flex-wrap gap-2">
        {(readOnly ? athletes.filter((a) => picked.has(a.id)) : athletes).map((a) => (
          <label key={a.id} className="day" style={{ width: 'auto', padding: '0 14px' }}>
            <input
              type="checkbox"
              className="sr-only"
              checked={picked.has(a.id)}
              disabled={readOnly}
              onChange={() => toggle(a.id)}
            />
            <AthleteName athlete={a} />
          </label>
        ))}
      </div>

      {athletes.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>
          La rosa è vuota: aggiungi prima i giocatori da Atleti.
        </p>
      )}

      {!readOnly && (
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={pending}
            onClick={() => onSave([...picked])}
          >
            Salva rosa
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPicked(new Set(selected))}
          >
            Ripristina
          </button>
        </div>
      )}
    </div>
  )
}
