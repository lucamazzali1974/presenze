import { RoleManager } from '@/components/role-manager'
import { requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import type { Role, RolePermission } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  const { profile, perms } = await requireSection('ruoli')
  const supabase = await createClient()

  const [rolesRes, permsRes, profilesRes] = await Promise.all([
    supabase.from('roles').select('*').order('sort').order('name'),
    supabase.from('role_permissions').select('*'),
    supabase.from('profiles').select('role_id'),
  ])

  // Quanti account ha ogni ruolo: serve a dire "non lo puoi eliminare".
  const counts: Record<string, number> = {}
  for (const p of (profilesRes.data ?? []) as { role_id: string | null }[]) {
    if (p.role_id) counts[p.role_id] = (counts[p.role_id] ?? 0) + 1
  }

  const matrix: Record<string, Record<string, string>> = {}
  for (const rp of (permsRes.data ?? []) as RolePermission[]) {
    matrix[rp.role_id] = { ...(matrix[rp.role_id] ?? {}), [rp.section]: rp.level }
  }

  return (
    <RoleManager
      roles={(rolesRes.data ?? []) as Role[]}
      matrix={matrix}
      counts={counts}
      myRoleId={profile.role_id}
      isAdmin={profile.role === 'admin'}
      canEdit={canEdit(perms, 'ruoli')}
      loadError={rolesRes.error?.message ?? permsRes.error?.message ?? null}
    />
  )
}
