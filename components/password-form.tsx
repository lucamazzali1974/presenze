'use client'

import { useRef, useState, useTransition } from 'react'
import { changeMyPassword } from '@/lib/actions/auth'

export function PasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await changeMyPassword(formData)
      if (res?.error) {
        setDone(false)
        return setError(res.error)
      }
      setError(null)
      setDone(true)
      formRef.current?.reset()
    })
  }

  return (
    <form ref={formRef} action={submit} className="panel p-4">
      <p className="mini">Cambia password</p>

      <div className="mt-3 grid gap-4">
        <label className="field">
          <span>Nuova password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="field">
          <span>Ripetila</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
        Almeno 8 caratteri. Resti collegato: non devi rifare l&rsquo;accesso.
      </p>

      {error && <p className="alert mt-4">{error}</p>}
      {done && !error && (
        <p className="mt-4 text-sm" style={{ color: 'var(--green)' }}>
          Password aggiornata. Da adesso entri con quella nuova.
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-4" disabled={isPending}>
        Salva password
      </button>
    </form>
  )
}
