'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createAthlete,
  deleteAthlete,
  toggleAthleteActive,
  updateAthlete,
} from '@/lib/actions/athletes'
import { AthleteName } from '@/components/athlete-name'
import { formatDate, fullName, todayInput } from '@/lib/format'
import type { Athlete } from '@/lib/types'

export function AthleteManager({
  athletes,
  teamsOf = {},
  hasTeams = false,
  isAdmin,
}: {
  athletes: Athlete[]
  teamsOf?: Record<string, string[]>
  hasTeams?: boolean
  isAdmin: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createAthlete(formData)
      if (res?.error) return setError(res.error)
      setError(null)
      formRef.current?.reset()
      setShowForm(false)
    })
  }

  const visible = query.trim()
    ? athletes.filter((a) =>
        `${a.first_name} ${a.last_name} ${a.nickname ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : athletes

  const inRosa = athletes.filter((a) => a.active).length
  const fuori = athletes.length - inRosa

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Rosa</p>
        <h1 className="h1">Atleti</h1>
        <p className="sub">
          {inRosa} in rosa{fuori > 0 && ` · ${fuori} fuori rosa`}
        </p>

        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Annulla' : 'Aggiungi giocatore'}
          </button>
        )}
      </div>

      {isAdmin && showForm && (
        <form ref={formRef} action={submitCreate} className="panel mb-4 p-4">
          <div className="grid-2">
            <label className="field">
              <span>Nome</span>
              <input name="first_name" required />
            </label>
            <label className="field">
              <span>Cognome</span>
              <input name="last_name" required />
            </label>
            <label className="field">
              <span>Soprannome</span>
              <input name="nickname" placeholder="facoltativo" />
            </label>
            <label className="field">
              <span>In rosa dal</span>
              <input name="joined_on" type="date" defaultValue={todayInput()} required />
            </label>
          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--faint)' }}>
            Gli appelli chiusi prima di questa data non entrano nelle sue
            percentuali. Se il giocatore c&rsquo;era gi&agrave;, sposta la data
            indietro.
          </p>

          <button type="submit" className="btn btn-primary mt-5" disabled={isPending}>
            Salva giocatore
          </button>
        </form>
      )}

      {error && <p className="alert mb-4">{error}</p>}

      {athletes.length > 8 && (
        <div className="mb-4">
          <input
            className="search"
            placeholder="Cerca per soprannome, nome o cognome"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cerca un giocatore"
          />
        </div>
      )}

      <ul className="panel rows">
        {visible.map((a) => (
          <li key={a.id} className="row">
            {editing === a.id ? (
              <form
                action={(formData) => {
                  startTransition(async () => {
                    const res = await updateAthlete(a.id, formData)
                    if (res?.error) return setError(res.error)
                    setError(null)
                    setEditing(null)
                  })
                }}
              >
                <div className="grid-2">
                  <label className="field">
                    <span>Nome</span>
                    <input name="first_name" defaultValue={a.first_name} required />
                  </label>
                  <label className="field">
                    <span>Cognome</span>
                    <input name="last_name" defaultValue={a.last_name} required />
                  </label>
                  <label className="field">
                    <span>Soprannome</span>
                    <input name="nickname" defaultValue={a.nickname ?? ''} />
                  </label>
                  <label className="field">
                    <span>In rosa dal</span>
                    <input
                      name="joined_on"
                      type="date"
                      defaultValue={a.joined_on?.slice(0, 10) ?? ''}
                      required
                    />
                  </label>
                </div>

                <p className="mt-3 text-sm" style={{ color: 'var(--faint)' }}>
                  Contano solo gli appelli chiusi da questa data in poi.
                </p>

                <div className="row-actions">
                  <button type="submit" className="btn btn-sm btn-primary" disabled={isPending}>
                    Salva
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setEditing(null)}
                  >
                    Annulla
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div
                  className="flex flex-wrap items-center justify-between gap-2"
                  style={{ opacity: a.active ? 1 : 0.5 }}
                >
                  <AthleteName athlete={a} />
                  {!a.active && <span className="tag">Fuori rosa</span>}
                </div>

                {hasTeams && (
                  <p className="mt-2 flex flex-wrap gap-2">
                    {(teamsOf[a.id] ?? []).map((name) => (
                      <span key={name} className="tag">
                        {name}
                      </span>
                    ))}
                    {(teamsOf[a.id] ?? []).length === 0 && (
                      <span className="tag warn">Nessuna squadra</span>
                    )}
                  </p>
                )}

                {a.joined_on && (
                  <p className="mini mt-2">
                    In rosa dal {formatDate(a.joined_on.slice(0, 10))}
                  </p>
                )}

                {isAdmin && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setEditing(a.id)}
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          toggleAthleteActive(a.id, !a.active)
                        })
                      }
                    >
                      {a.active ? 'Metti fuori rosa' : 'Rimetti in rosa'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `Eliminare ${fullName(a)}? Spariscono anche le sue assenze e le sue percentuali. Se ha solo lasciato la squadra usa "Metti fuori rosa".`
                          )
                        ) {
                          startTransition(() => {
                            deleteAthlete(a.id)
                          })
                        }
                      }}
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}

        {visible.length === 0 && (
          <li className="empty">
            {athletes.length === 0
              ? isAdmin
                ? 'La rosa è vuota. Aggiungi il primo giocatore.'
                : 'La rosa è ancora vuota.'
              : 'Nessun giocatore corrisponde alla ricerca.'}
          </li>
        )}
      </ul>
    </main>
  )
}
