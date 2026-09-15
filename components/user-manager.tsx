'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createUser,
  deleteUser,
  setUserPassword,
  setUserStatus,
  updateUser,
} from '@/lib/actions/users'
import { linkAthleteProfile } from '@/lib/actions/athletes'
import { formatShort, fullName } from '@/lib/format'
import type { Athlete, Profile, Team } from '@/lib/types'

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

const ROLE_LABEL: Record<Profile['role'], string> = {
  admin: 'Amministratori',
  user: 'Allenatori',
  athlete: 'Atleti',
}

/** Ordine delle sottosezioni dentro ogni gruppo. */
const ROLE_ORDER: Profile['role'][] = ['admin', 'user', 'athlete']

/** Oltre questa soglia l'elenco si taglia e compare "mostra tutti". */
const PAGE = 30

export function UserManager({
  users,
  athletes,
  teams,
  teamIdsOf = {},
  meId,
  canManageAccounts,
}: {
  users: Profile[]
  athletes: Athlete[]
  teams: Team[]
  /** Le squadre di ogni account, via la sua scheda atleta. */
  teamIdsOf?: Record<string, string[]>
  meId: string
  canManageAccounts: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const createRef = useRef<HTMLFormElement>(null)

  const pending = users.filter((u) => u.status === 'pending')

  // Quale scheda atleta e' gia' collegata a quale account.
  const athleteOf = new Map(
    athletes.filter((a) => a.profile_id).map((a) => [a.profile_id as string, a])
  )

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

  const needle = query.trim().toLowerCase()

  const matching = needle
    ? users.filter((u) => {
        const athlete = athleteOf.get(u.id)
        return `${u.full_name ?? ''} ${u.email ?? ''} ${
          athlete ? fullName(athlete) : ''
        }`
          .toLowerCase()
          .includes(needle)
      })
    : users

  /*
   * Lo staff non appartiene a una squadra: allenatori e admin lavorano
   * su tutta la societa'. Quindi una sezione "Staff" a parte, poi una
   * per squadra con i suoi atleti, e in fondo chi non e' assegnato.
   */
  const staff = matching.filter((u) => u.role !== 'athlete')
  const players = matching.filter((u) => u.role === 'athlete')

  const groups: { key: string; title: string; users: Profile[] }[] = []

  if (staff.length > 0) {
    groups.push({ key: 'staff', title: 'Staff', users: staff })
  }

  for (const team of teams) {
    const inTeam = players.filter((u) => (teamIdsOf[u.id] ?? []).includes(team.id))
    if (inTeam.length > 0) {
      groups.push({ key: team.id, title: team.name, users: inTeam })
    }
  }

  const orphans = players.filter((u) => (teamIdsOf[u.id] ?? []).length === 0)
  if (orphans.length > 0) {
    groups.push({ key: 'none', title: 'Senza squadra', users: orphans })
  }

  const rowProps = {
    meId,
    canManageAccounts,
    athletes,
    athleteOf,
    isPending,
    editing,
    setEditing,
    setError,
    run,
    startTransition,
  }

  return (
    <main className="wrap pb-16">
      <div className="page-head">
        <p className="eyebrow">// Accessi</p>
        <h1 className="h1">Utenti</h1>
        <p className="sub">
          {users.length} in tutto
          {pending.length > 0
            ? ` · ${pending.length} in attesa di approvazione`
            : ''}
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
                <option value="athlete">Atleta</option>
              </select>
            </label>
          </div>

          <p className="mt-4 text-sm" style={{ color: 'var(--color-faint)' }}>
            L’accesso nasce già attivo. Comunica tu la password: l’app non manda
            email. Per un giocatore conviene invece «Crea accesso» da Atleti:
            usa il soprannome e collega la scheda da solo.
          </p>

          <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
            Crea accesso
          </button>
        </form>
      )}

      {error && <p className="alert mb-4">{error}</p>}

      {users.length > PAGE && (
        <div className="mb-4">
          <input
            className="search"
            placeholder="Cerca per nome, email o giocatore"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Cerca un utente"
          />
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="mb-5">
          <p className="mini mb-2">
            {group.title} · {group.users.length}
          </p>

          {ROLE_ORDER.map((role) => {
            const list = group.users.filter((u) => u.role === role)
            if (list.length === 0) return null

            const key = `${group.key}:${role}`
            const open = expanded.has(key) || Boolean(needle)
            const shown = open ? list : list.slice(0, PAGE)
            const hidden = list.length - shown.length

            return (
              <div key={key} className="mb-3">
                {/* L'intestazione del ruolo si mostra solo se il gruppo
                    ne contiene piu' d'uno: con soli atleti sarebbe rumore. */}
                {group.users.some((u) => u.role !== role) && (
                  <p
                    className="mini mb-2"
                    style={{ color: 'var(--color-faint)' }}
                  >
                    {ROLE_LABEL[role]} ({list.length})
                  </p>
                )}

                <ul className="panel rows">
                  {shown.map((u) => (
                    <UserRow key={u.id} user={u} {...rowProps} />
                  ))}
                </ul>

                {hidden > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm mt-2"
                    onClick={() =>
                      setExpanded((prev) => new Set(prev).add(key))
                    }
                  >
                    Mostra gli altri {hidden}
                  </button>
                )}

                {open && list.length > PAGE && !needle && (
                  <button
                    type="button"
                    className="btn btn-sm mt-2"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        next.delete(key)
                        return next
                      })
                    }
                  >
                    Mostra solo i primi {PAGE}
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {groups.length === 0 && (
        <div className="panel">
          <p className="empty">
            {users.length === 0
              ? 'Nessun utente registrato.'
              : 'Nessun utente corrisponde alla ricerca.'}
          </p>
        </div>
      )}
    </main>
  )
}

type RowProps = {
  user: Profile
  meId: string
  canManageAccounts: boolean
  athletes: Athlete[]
  athleteOf: Map<string, Athlete>
  isPending: boolean
  editing: string | null
  setEditing: (id: string | null) => void
  setError: (msg: string | null) => void
  run: (fn: () => Promise<{ error?: string } | undefined>) => void
  startTransition: (fn: () => void) => void
}

function UserRow({
  user: u,
  meId,
  canManageAccounts,
  athletes,
  athleteOf,
  isPending,
  editing,
  setEditing,
  setError,
  run,
  startTransition,
}: RowProps) {
  return (
    <li className="row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>
          {u.full_name || u.email}
        </span>

        <span className="flex flex-wrap gap-2">
          {u.id === meId && <span className="tag">Tu</span>}
          {u.role === 'admin' && <span className="tag info">Admin</span>}
          {u.role === 'athlete' &&
            (athleteOf.has(u.id) ? (
              <span className="tag">Atleta · {fullName(athleteOf.get(u.id)!)}</span>
            ) : (
              <span className="tag warn">Atleta senza scheda</span>
            ))}
          <span className={STATUS_TAG[u.status]}>{STATUS_LABEL[u.status]}</span>
        </span>
      </div>

      <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
        {u.email} · dal {formatShort(u.created_at)}
      </p>

      {u.role === 'athlete' && (
        <AthleteLink
          user={u}
          athletes={athletes}
          linked={athleteOf.get(u.id) ?? null}
          pending={isPending}
          onLink={(athleteId, profileId) =>
            run(() => linkAthleteProfile(athleteId, profileId))
          }
        />
      )}

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
                <option value="athlete">Atleta</option>
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
            <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
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

          <button type="button" className="btn btn-sm" onClick={() => setEditing(u.id)}>
            Modifica
          </button>

          {canManageAccounts && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={isPending}
              onClick={() => {
                const pwd = prompt(`Nuova password per ${u.email} (almeno 8 caratteri):`)
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
  )
}

/**
 * Collega un account alla sua scheda atleta. Senza, il ruolo 'athlete'
 * non sa chi segnare: l'app glielo dice, ma il collegamento lo fa l'admin.
 */
function AthleteLink({
  user,
  athletes,
  linked,
  pending,
  onLink,
}: {
  user: Profile
  athletes: Athlete[]
  linked: Athlete | null
  pending: boolean
  onLink: (athleteId: string, profileId: string | null) => void
}) {
  const [choice, setChoice] = useState(linked?.id ?? '')

  // Si possono scegliere solo le schede libere, piu' quella gia' collegata.
  const selectable = athletes.filter((a) => !a.profile_id || a.id === linked?.id)

  return (
    <div className="mt-3">
      <p className="mini mb-2">Scheda atleta</p>

      <div className="row-actions" style={{ marginTop: 0 }}>
        <label className="field" style={{ flex: '1 1 14rem' }}>
          <span className="sr-only">Scheda atleta</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">— nessuna —</option>
            {selectable.map((a) => (
              <option key={a.id} value={a.id}>
                {fullName(a)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={pending || choice === (linked?.id ?? '')}
          onClick={() => {
            if (!choice && linked) return onLink(linked.id, null)
            if (choice) onLink(choice, user.id)
          }}
        >
          Collega
        </button>
      </div>

      {!linked && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-faint)' }}>
          Finché non la colleghi, questo account entra ma non ha niente da
          segnare.
        </p>
      )}
    </div>
  )
}
