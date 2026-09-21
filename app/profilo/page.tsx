import { Nav } from '@/components/nav'
import { PasswordForm } from '@/components/password-form'
import { PushToggle } from '@/components/push-toggle'
import { isStaff, myAthlete, requireAccess } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { emailToUsername, isAthleteEmail } from '@/lib/username'
import { fullName } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function ProfiloPage() {
  const { profile, perms } = await requireAccess()
  const me = await myAthlete(profile)

  // Il nome del ruolo arriva dalla tabella: e' quello che l'admin ha scelto.
  const supabase = await createClient()
  const { data: role } = profile.role_id
    ? await supabase.from('roles').select('name').eq('id', profile.role_id).maybeSingle()
    : { data: null }

  return (
    <>
      <Nav perms={perms} />

      <main className="wrap pb-16" style={{ maxWidth: '560px' }}>
        <div className="page-head">
          <p className="eyebrow">// Profilo</p>
          <h1 className="h1">{profile.full_name || 'Il tuo accesso'}</h1>
          <p className="sub">
            {(role as { name: string } | null)?.name ?? 'Senza ruolo'}
            {me ? ` · scheda di ${fullName(me)}` : ''}
          </p>
        </div>

        <div className="panel mb-4 p-4">
          <p className="mini">
            {isAthleteEmail(profile.email) ? 'Entri con' : 'Email'}
          </p>
          <p className="mt-1" style={{ color: 'var(--color-text)', fontWeight: 500 }}>
            {emailToUsername(profile.email) ?? '—'}
          </p>
          {isStaff(profile) && (
            <p className="mt-3 text-sm" style={{ color: 'var(--color-faint)' }}>
              Per cambiare l&rsquo;indirizzo serve un amministratore.
            </p>
          )}
        </div>

        <PasswordForm />

        {/* I promemoria sono per chi deve segnalarsi: lo staff compila
            l'appello guardando il campo, non gli serve una notifica. */}
        {profile.role === 'athlete' && (
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
        )}
      </main>
    </>
  )
}
