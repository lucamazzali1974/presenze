'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createRole,
  deleteRole,
  setDefaultRole,
  setRolePermissions,
  updateRole,
} from '@/lib/actions/roles'
import {
  LEVELS,
  LEVEL_LABEL,
  SECTIONS,
  SECTION_META,
  type Level,
  type Section,
} from '@/lib/permissions'
import { ROLE_BASE_HINT, ROLE_BASE_LABEL, type Role, type RoleBase } from '@/lib/types'
import { Busy } from '@/components/spinner'

type Matrix = Record<string, Record<string, string>>

export function RoleManager({
  roles,
  matrix,
  counts,
  myRoleId,
  isAdmin,
  canEdit,
  loadError,
}: {
  roles: Role[]
  matrix: Matrix
  counts: Record<string, number>
  myRoleId: string | null
  isAdmin: boolean
  canEdit: boolean
  loadError: string | null
}) {
  const [error, setError] = useState<string | null>(loadError)
  const [showCreate, setShowCreate] = useState(false)
  const [open, setOpen] = useState<string | null>(roles[0]?.id ?? null)
  const [editing, setEditing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const createRef = useRef<HTMLFormElement>(null)

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const res = await fn()
      setError(res?.error ?? null)
    })
  }

  return (
    <main className="wrap pb-16">
      <Busy show={isPending} />

      <div className="page-head">
        <p className="eyebrow">// Permessi</p>
        <h1 className="h1">Ruoli</h1>
        <p className="sub">
          Per ogni ruolo decidi sezione per sezione: nascosta, in sola lettura o
          modificabile. Gli amministratori vedono comunque tutto.
        </p>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Annulla' : 'Crea un ruolo'}
          </button>
        )}
      </div>

      {error && <p className="alert mb-4">{error}</p>}

      {showCreate && canEdit && (
        <form
          ref={createRef}
          action={(formData) => {
            startTransition(async () => {
              const res = await createRole(formData)
              if (res?.error) return setError(res.error)
              setError(null)
              setShowCreate(false)
              createRef.current?.reset()
            })
          }}
          className="panel mb-4 p-4"
        >
          <div className="grid-2">
            <label className="field">
              <span>Nome del ruolo</span>
              <input name="name" placeholder="Team manager" required />
            </label>
            <label className="field">
              <span>Tipo base</span>
              <select name="base" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="athlete">Giocatore</option>
                {isAdmin && <option value="admin">Amministratore</option>}
              </select>
            </label>
          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--color-faint)' }}>
            Il tipo base non si cambia dopo: decide cosa il database concede.
            Staff opera su tutta la rosa, Giocatore solo su se stesso. Il ruolo
            nasce con tutte le sezioni nascoste: le apri qui sotto.
          </p>

          <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
            Crea ruolo
          </button>
        </form>
      )}

      {roles.map((role) => {
        const users = counts[role.id] ?? 0
        const isOpen = open === role.id
        // L'admin bypassa la matrice: mostrarla modificabile sarebbe una bugia.
        const locked = !canEdit || role.base === 'admin'

        return (
          <section key={role.id} className="panel mb-4">
            <div className="panel-head">
              <div>
                <p className="perm-name">{role.name}</p>
                <p className="perm-hint">
                  {ROLE_BASE_LABEL[role.base]} · {users}{' '}
                  {users === 1 ? 'account' : 'account'}
                </p>
              </div>

              <span className="flex flex-wrap items-center gap-2">
                {role.is_default && <span className="tag info">Predefinito</span>}
                {role.is_system && <span className="tag">Di sistema</span>}
                {role.id === myRoleId && <span className="tag">Il tuo</span>}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setOpen(isOpen ? null : role.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Chiudi' : 'Permessi'}
                </button>
              </span>
            </div>

            {isOpen && (
              <>
                <p className="row" style={{ color: 'var(--color-muted)' }}>
                  {ROLE_BASE_HINT[role.base]}
                </p>

                {role.base === 'admin' ? (
                  <p className="row" style={{ color: 'var(--color-faint)' }}>
                    Accesso completo a tutte le sezioni: non c’è niente da
                    configurare.
                  </p>
                ) : (
                  <PermissionMatrix
                    role={role}
                    levels={matrix[role.id] ?? {}}
                    locked={locked}
                    pending={isPending}
                    onSave={(entries) =>
                      run(() => setRolePermissions(role.id, entries))
                    }
                  />
                )}

                {canEdit && (
                  <div className="row">
                    {editing === role.id ? (
                      <form
                        action={(formData) => {
                          startTransition(async () => {
                            const res = await updateRole(role.id, formData)
                            if (res?.error) return setError(res.error)
                            setError(null)
                            setEditing(null)
                          })
                        }}
                      >
                        <div className="grid-2">
                          <label className="field">
                            <span>Nome</span>
                            <input name="name" defaultValue={role.name} required />
                          </label>
                          <label className="field">
                            <span>Tipo base</span>
                            <select
                              name="base"
                              defaultValue={role.base}
                              disabled={role.is_system}
                            >
                              <option value="staff">Staff</option>
                              <option value="athlete">Giocatore</option>
                              {isAdmin && <option value="admin">Amministratore</option>}
                            </select>
                          </label>
                        </div>

                        {role.is_system && (
                          <p
                            className="mt-3 text-sm"
                            style={{ color: 'var(--color-faint)' }}
                          >
                            Un ruolo di sistema si rinomina, ma il tipo base
                            resta: ci si appoggiano i permessi del database.
                          </p>
                        )}

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
                            onClick={() => setEditing(null)}
                          >
                            Annulla
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="row-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setEditing(role.id)}
                        >
                          Rinomina
                        </button>

                        {!role.is_default && role.base !== 'admin' && (
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={isPending}
                            onClick={() => run(() => setDefaultRole(role.id))}
                          >
                            Usa per le nuove registrazioni
                          </button>
                        )}

                        {!role.is_system && (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={isPending || users > 0}
                            onClick={() => {
                              if (confirm(`Eliminare il ruolo “${role.name}”?`)) {
                                run(() => deleteRole(role.id))
                              }
                            }}
                          >
                            {users > 0 ? `Assegnato a ${users}` : 'Elimina'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )
      })}

      {roles.length === 0 && (
        <div className="panel">
          <p className="empty">
            Nessun ruolo: esegui la migrazione 010 nel database.
          </p>
        </div>
      )}
    </main>
  )
}

/**
 * La matrice di un ruolo. Si modifica in locale e si salva tutta insieme:
 * salvare a ogni clic vorrebbe dire una chiamata per casella, e su una
 * riga sbagliata non si torna indietro.
 */
function PermissionMatrix({
  role,
  levels,
  locked,
  pending,
  onSave,
}: {
  role: Role
  levels: Record<string, string>
  locked: boolean
  pending: boolean
  onSave: (entries: { section: Section; level: Level }[]) => void
}) {
  const initial = SECTIONS.reduce(
    (acc, s) => {
      acc[s] = (levels[s] as Level) ?? 'none'
      return acc
    },
    {} as Record<Section, Level>
  )

  const [draft, setDraft] = useState(initial)

  const dirty = SECTIONS.some((s) => draft[s] !== initial[s])

  return (
    <>
      <ul className="rows" style={{ borderTop: '1px solid var(--color-line)' }}>
        {SECTIONS.map((section) => {
          const meta = SECTION_META[section]
          const level = draft[section]

          return (
            <li key={section} className="perm-row">
              <div>
                <p className="perm-name">{meta.label}</p>
                <p className="perm-hint">
                  {level === 'edit' ? meta.edit : level === 'view' ? meta.view : '—'}
                </p>
              </div>

              <div className="perm-set">
                {LEVELS.map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`${role.id}:${section}`}
                      value={value}
                      checked={level === value}
                      disabled={locked || pending}
                      onChange={() =>
                        setDraft((prev) => ({ ...prev, [section]: value }))
                      }
                    />
                    {LEVEL_LABEL[value]}
                  </label>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {!locked && (
        <div className="row">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!dirty || pending}
            onClick={() =>
              onSave(SECTIONS.map((section) => ({ section, level: draft[section] })))
            }
          >
            {dirty ? 'Salva i permessi' : 'Nessuna modifica'}
          </button>
        </div>
      )}
    </>
  )
}
