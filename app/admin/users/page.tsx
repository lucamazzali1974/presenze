import { UserManager } from '@/components/user-manager'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { hasAdminKey } from '@/utils/supabase/admin'
import type { Athlete, Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const me = await requireAdmin()
  const supabase = await createClient()

  const [{ data }, { data: athletes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      // Prima chi aspetta approvazione: e' l'unica cosa che richiede un'azione.
      .order('status', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
  ])

  return (
    <UserManager
      users={(data ?? []) as Profile[]}
      athletes={(athletes ?? []) as Athlete[]}
      meId={me.id}
      canManageAccounts={hasAdminKey()}
    />
  )
}
