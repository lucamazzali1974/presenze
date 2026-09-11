import { redirect } from 'next/navigation'
import { signOut } from '@/lib/actions/auth'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single()

  const blocked = profile?.status === 'blocked'

  return (
    <main
      className="wrap flex min-h-screen items-center"
      style={{ maxWidth: '440px' }}
    >
      <div className="w-full py-12">
        <p className="brand-mark">
          PRE<em>/</em>SENZE
        </p>

        <div className="panel mt-7 p-6">
          <p className="eyebrow">// {blocked ? 'Sospeso' : 'In attesa'}</p>
          <h1 className="h1">
            {blocked ? 'Accesso sospeso' : 'Account da attivare'}
          </h1>
          <p className="sub">
            {blocked
              ? 'Il tuo accesso è stato sospeso. Parlane con un responsabile della squadra.'
              : 'Un responsabile deve approvare la tua registrazione. Riprova tra poco.'}
          </p>

          <form action={signOut} className="mt-6">
            <button type="submit" className="btn">
              Esci
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
