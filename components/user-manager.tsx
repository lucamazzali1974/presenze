'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createUser,
  deleteUser,
  setUserPassword,
  setUserStatus,
  updateUser,
} from '@/lib/actions/users'
import { formatShort } from '@/lib/format'
import type { Profile } from '@/lib/types'

const STATUS_LABEL: Record<Profile['status'], string> = {
  pending: 'In attesa',
  active: 'Attivo',
  blocked: 'Bloccato',
}

const STATUS_TAG: Record<Profile['status'], string> = {
  pending: 'tag warn',
  active: 'tag pass',
  blocked: 'tag fail',
}

export function UserManager({
  users,
  meId,
  canManageAccounts,
}: {
  users: Profile[]
  meId: string
  canManageAccounts: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const createRef = useRef<HTMLFormElement>(null)

  const pending = users.filter((u) => u.status === 'pending')

  function run(fn: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      const res = await fn()
      setError(res?.error ?? null)
    })
  }

  function submitCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createUser(formData)
      if (res?.error) return setError(res.error)
      setError(null)
      setShowCreate(false)
      createRef.current?.reset()
    })
  }

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Accessi</p>
        <h1 className="h1">Utenti</h1>
        <p className="sub">
          {pending.length > 0
            ? `${pending.length} in attesa di approvazione`
            : 'Nessuna richiesta in attesa'}
        </p>

        {canManageAccounts ? (
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Annulla' : 'Crea un accesso'}
          </button>
        ) : (
          <p className="mt-5 text-sm" style={{ color: 'var(--color-faint)' }}>
            Per creare o eliminare accessi da qui serve la variabile
            SUPABASE_SECRET_KEY. Senza, puoi comunque approvare, bloccare e
            modificare chi si registra da solo.
          </p>
        )}
      </div>

      {showCreate && canManageAccounts && (
        <form ref={createRef} action={submitCreate} className="panel mb-4 p-4">
          <div className="grid-2">
            <label className="field">
              <span>Nome e cognome</span>
              <input name="full_name" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Password provvisoria</span>
              <input name="password" type="text" minLength={8} required />
            </label>
            <label className="field">
              <span>Ruolo</span>
              <select name="role">
                <option value="user">Allenatore</option>
                <option value="admin">Amministratore</option>
              </select>
            </label>
          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--color-faint)' }}>
            L’accesso nasce già attivo. Comunica tu la password: l’app non manda
            email.
          </p>

          <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
            Crea accesso
          </button>
        </form>
      )}

      {error && <p className="alert mb-4">{error}</p>}

      <ul className="panel rows">
        {users.map((u) => (
          <li key={u.id} className="row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
                {u.full_name || u.email}
              </span>

              <span className="flex flex-wrap gap-2">
                {u.id === meId && <span className="tag">Tu</span>}
                {u.role === 'admin' && <span className="tag info">Admin</span>}
                <span className={STATUS_TAG[u.status]}>{STATUS_LABEL[u.status]}</span>
              </span>
            </div>

            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
              {u.email} · dal {formatShort(u.created_at)}
            </p>

            {editing === u.id ? (
              <form
                action={(formData) => {
                  startTransition(async () => {
                    const res = await updateUser(u.id, formData)
                    if (res?.error) return setError(res.error)
                    setError(null)
                    setEditing(null)
                  })
                }}
                className="mt-4"
              >
                <div className="grid-2">
                  <label className="field">
                    <span>Nome e cognome</span>
                    <input name="full_name" defaultValue={u.full_name ?? ''} />
                  </label>
                  <label className="field">
                    <span>Ruolo</span>
                    <select name="role" defaultValue={u.role}>
                      <option value="user">Allenatore</option>
                      <option value="admin">Amministratore</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Stato</span>
                    <select name="status" defaultValue={u.status}>
                      <option value="pending">In attesa</option>
                      <option value="active">Attivo</option>
                      <option value="blocked">Bloccato</option>
                    </select>
                  </label>
                </div>

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
              <div className="row-actions">
                {u.status !== 'active' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={isPending}
                    onClick={() => run(() => setUserStatus(u.id, 'active'))}
                  >
                    Attiva
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setEditing(u.id)}
                >
                  Modifica
                </button>

                {canManageAccounts && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={isPending}
                    onClick={() => {
                      const pwd = prompt(
                        `Nuova password per ${u.email} (almeno 8 caratteri):`
                      )
                      if (pwd) run(() => setUserPassword(u.id, pwd))
                    }}
                  >
                    Cambia password
                  </button>
                )}

                {u.status !== 'blocked' && u.id !== meId && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={isPending}
                    onClick={() => run(() => setUserStatus(u.id, 'blocked'))}
                  >
                    Blocca
                  </button>
                )}

                {canManageAccounts && u.id !== meId && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Eliminare definitivamente l’accesso di ${u.email}? Per togliergli l’ingresso senza cancellarlo usa "Blocca".`
                        )
                      ) {
                        run(() => deleteUser(u.id))
                      }
                    }}
                  >
                    Elimina
                  </button>
                )}
              </div>
            )}
          </li>
        ))}

        {users.length === 0 && <li className="empty">Nessun utente registrato.</li>}
      </ul>
    </main>
  )
}
