'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { signIn, signUp } from '@/lib/actions/auth'
import { Spinner } from '@/components/spinner'

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isSignup = mode === 'signup'

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = isSignup ? await signUp(formData) : await signIn(formData)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <main
      className="wrap flex min-h-screen items-center"
      style={{ maxWidth: '440px' }}
    >
      <div className="w-full py-12">
        <p className="brand-mark">
          PRE<em>/</em>SENZE
        </p>

        <h1 className="h1 mt-6">
          {isSignup ? 'Crea il tuo accesso' : 'Entra'}
        </h1>
        <p className="sub">
          {isSignup
            ? 'Dopo la registrazione un responsabile deve attivare il tuo account.'
            : 'Giocatori col soprannome, staff con l’email.'}
        </p>

        <form action={submit} className="panel mt-7 grid gap-4 p-5">
          {isSignup && (
            <label className="field">
              <span>Nome e cognome</span>
              <input name="full_name" required />
            </label>
          )}

          {isSignup ? (
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
          ) : (
            <label className="field">
              <span>Soprannome o email</span>
              <input
                name="identifier"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>
          )}

          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {error && <p className="alert">{error}</p>}

          <button type="submit" className="btn btn-primary mt-1" disabled={isPending}>
            {isPending ? (
              <Spinner label={isSignup ? 'Registro…' : 'Entro…'} />
            ) : isSignup ? (
              'Registrati'
            ) : (
              'Entra'
            )}
          </button>
        </form>

        <p className="mt-6 text-sm" style={{ color: 'var(--color-muted)' }}>
          {isSignup ? (
            <>
              Hai già un accesso? <Link href="/login">Entra</Link>
            </>
          ) : (
            <>
              Sei un giocatore e non hai le credenziali? Chiedile
              all’allenatore. Staff: <Link href="/register">registrati</Link>.
            </>
          )}
        </p>
      </div>
    </main>
  )
}
