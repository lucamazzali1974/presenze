import { UserManager } from '@/components/user-manager'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { hasAdminKey } from '@/utils/supabase/admin'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const me = await requireAdmin()
  const supabase = await createClient()

  const { data } = await supabase
    .from('profiles')
    .select('*')
    // Prima chi aspetta approvazione: e' l'unica cosa che richiede un'azione.
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  return (
    <UserManager
      users={(data ?? []) as Profile[]}
      meId={me.id}
      canManageAccounts={hasAdminKey()}
    />
  )
}
