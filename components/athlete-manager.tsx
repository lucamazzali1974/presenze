'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createAthlete,
  deleteAthlete,
  toggleAthleteActive,
  updateAthlete,
} from '@/lib/actions/athletes'
import { AthleteName } from '@/components/athlete-name'
import {
  createAthleteAccount,
  removeAthleteAccount,
  resetAthletePassword,
} from '@/lib/actions/athlete-accounts'
import { formatDate, fullName, todayInput } from '@/lib/format'
import { emailToUsername, suggestUsername } from '@/lib/username'
import type { Athlete, Profile } from '@/lib/types'
import { Busy } from '@/components/spinner'

export function AthleteManager({
  athletes,
  teamsOf = {},
  hasTeams = false,
  accountOf = {},
  canCreateAccounts = false,
  canEdit,
  canManageAccounts = false,
}: {
  athletes: Athlete[]
  teamsOf?: Record<string, string[]>
  hasTeams?: boolean
  /** L'account collegato a ogni giocatore, per chi puo' vederlo. */
  accountOf?: Record<string, Profile>
  /** Serve SUPABASE_SECRET_KEY: senza, gli accessi non si creano. */
  canCreateAccounts?: boolean
  /** 'Atleti' in modifica: anagrafica della rosa. */
  canEdit: boolean
  /** 'Utenti' in modifica: creare e togliere gli accessi dei giocatori. */
  canManageAccounts?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
      <Busy show={isPending} />

      <div className="page-head">
        <p className="eyebrow">// Rosa</p>
        <h1 className="h1">Atleti</h1>
        <p className="sub">
          {inRosa} in rosa{fuori > 0 && ` · ${fuori} fuori rosa`}
        </p>

        {canEdit && (
          <button
            type="button"
            className="btn btn-primary mt-5"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Annulla' : 'Aggiungi giocatore'}
          </button>
        )}
      </div>

      {canEdit && showForm && (
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

      {notice && (
        <p className="panel mb-4 p-4 text-sm" style={{ color: 'var(--color-text)' }}>
          {notice}
        </p>
      )}

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

                {canManageAccounts && (
                  <p className="mt-2 flex flex-wrap items-center gap-2">
                    {accountOf[a.id] ? (
                      <>
                        <span className="tag pass">
                          Accede come {emailToUsername(accountOf[a.id].email)}
                        </span>
                        {accountOf[a.id].status !== 'active' && (
                          <span className="tag warn">
                            Accesso {accountOf[a.id].status === 'blocked' ? 'bloccato' : 'in attesa'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="tag">Nessun accesso</span>
                    )}
                  </p>
                )}

                {canEdit && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setEditing(a.id)}
                    >
                      Modifica
                    </button>
                    {canManageAccounts && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          setError(null)
                          setNotice(null)
                          setAccount(account === a.id ? null : a.id)
                        }}
                      >
                        {account === a.id
                          ? 'Chiudi accesso'
                          : accountOf[a.id]
                            ? 'Gestisci accesso'
                            : 'Crea accesso'}
                      </button>
                    )}
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

                {canManageAccounts && account === a.id && (
                  <AccountPanel
                    athlete={a}
                    account={accountOf[a.id] ?? null}
                    enabled={canCreateAccounts}
                    pending={isPending}
                    onCreate={(formData) =>
                      startTransition(async () => {
                        const res = await createAthleteAccount(a.id, formData)
                        if (res?.error) return setError(res.error)
                        setError(null)
                        setNotice(
                          `Accesso creato: ${fullName(a)} entra con «${res.username}» e la password che hai scelto.`
                        )
                        setAccount(null)
                      })
                    }
                    onReset={(formData) =>
                      startTransition(async () => {
                        const id = accountOf[a.id]?.id
                        if (!id) return
                        const res = await resetAthletePassword(id, formData)
                        if (res?.error) return setError(res.error)
                        setError(null)
                        setNotice('Password aggiornata. Comunicagliela tu.')
                      })
                    }
                    onRemove={() =>
                      startTransition(async () => {
                        const id = accountOf[a.id]?.id
                        if (!id) return
                        const res = await removeAthleteAccount(id)
                        if (res?.error) return setError(res.error)
                        setError(null)
                        setNotice(
                          `Accesso rimosso. ${fullName(a)} resta in rosa: da ora lo segni tu.`
                        )
                        setAccount(null)
                      })
                    }
                  />
                )}
              </>
            )}
          </li>
        ))}

        {visible.length === 0 && (
          <li className="empty">
            {athletes.length === 0
              ? canEdit
                ? 'La rosa è vuota. Aggiungi il primo giocatore.'
                : 'La rosa è ancora vuota.'
              : 'Nessun giocatore corrisponde alla ricerca.'}
          </li>
        )}
      </ul>
    </main>
  )
}

/**
 * Il pannello dove l'admin crea l'accesso di un giocatore: nome utente
 * (proposto dal soprannome) e password, da comunicare a voce. L'app non
 * manda email — e infatti l'indirizzo che sta sotto e' finto.
 */
function AccountPanel({
  athlete,
  account,
  enabled,
  pending,
  onCreate,
  onReset,
  onRemove,
}: {
  athlete: Athlete
  account: Profile | null
  enabled: boolean
  pending: boolean
  onCreate: (formData: FormData) => void
  onReset: (formData: FormData) => void
  onRemove: () => void
}) {
  if (!enabled) {
    return (
      <div className="mt-4 panel p-4">
        <p className="mini">Manca la chiave</p>

        <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
          Per creare accessi serve <code>SUPABASE_SECRET_KEY</code>, che qui non
          risulta impostata. La trovi in Supabase &rsaquo; Settings &rsaquo; API
          Keys &rsaquo; Secret keys: inizia per <code>sb_secret_</code>.
        </p>

        <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          <strong>In locale:</strong> aggiungi la riga{' '}
          <code>SUPABASE_SECRET_KEY=...</code> al file <code>.env.local</code> e
          riavvia <code>npm run dev</code>. Il file va letto all&rsquo;avvio, quindi
          il riavvio non è facoltativo.
        </p>

        <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
          <strong>Online:</strong> Vercel &rsaquo; Settings &rsaquo; Environment
          Variables, su Production, Preview e Development. Poi{' '}
          <strong>Redeploy</strong>: le variabili si applicano solo ai deploy
          nuovi, quello già online non la vede.
        </p>

        <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
          Gli accessi già creati continuano a funzionare: senza la chiave non se
          ne creano di nuovi e non si cambiano le password.
        </p>
      </div>
    )
  }

  if (account) {
    return (
      <div className="mt-4 panel p-4">
        <p className="mini">Accesso di {fullName(athlete)}</p>

        <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
          Entra da <strong>/login</strong> scrivendo{' '}
          <strong>{emailToUsername(account.email)}</strong> nel campo
          &laquo;Soprannome o email&raquo;.
        </p>

        <form action={onReset} className="mt-4">
          <label className="field">
            <span>Nuova password</span>
            <input name="password" type="text" minLength={8} required />
          </label>

          <div className="row-actions">
            <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
              Cambia password
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    `Rimuovere l'accesso di ${fullName(athlete)}? Resta in rosa con tutte le sue presenze, ma non entra più e lo segni tu.`
                  )
                ) {
                  onRemove()
                }
              }}
            >
              Rimuovi accesso
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <form action={onCreate} className="mt-4 panel p-4">
      <p className="mini">Nuovo accesso per {fullName(athlete)}</p>

      <div className="grid-2 mt-3">
        <label className="field">
          <span>Nome utente</span>
          <input
            name="username"
            defaultValue={suggestUsername(athlete)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span>Password provvisoria</span>
          <input name="password" type="text" minLength={8} required />
        </label>
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
        Minuscole, numeri e punti: &laquo;Ciccio Rossi&raquo; diventa
        &laquo;ciccio.rossi&raquo;. Comunica tu nome utente e password, l&rsquo;app
        non manda email. Nasce già attivo, con accesso limitato a sé stesso.
      </p>

      <button type="submit" className="btn btn-primary mt-4" disabled={pending}>
        Crea accesso
      </button>
    </form>
  )
}
