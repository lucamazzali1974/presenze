import { UserManager } from '@/components/user-manager'
import { requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import { hasAdminKey } from '@/utils/supabase/admin'
import type { Athlete, Profile, Role, StaffTeam, Team, TeamMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const { profile: me, perms } = await requireSection('utenti')
  const supabase = await createClient()

  const [
    { data },
    { data: athletes },
    { data: teams },
    { data: members },
    { data: roles },
    { data: staffTeams },
  ] = await Promise.all([
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
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('team_members').select('*'),
      supabase.from('roles').select('*').order('sort').order('name'),
      supabase.from('staff_teams').select('profile_id, team_id'),
    ])

  // Le squadre che segue ogni membro dello staff.
  const staffTeamIdsOf: Record<string, string[]> = {}
  for (const st of (staffTeams ?? []) as StaffTeam[]) {
    staffTeamIdsOf[st.profile_id] = [...(staffTeamIdsOf[st.profile_id] ?? []), st.team_id]
  }

  /*
   * Le squadre di ogni account, passando dalla sua scheda atleta: i
   * profili non hanno una squadra propria, ce l'ha il giocatore.
   */
  const teamsByAthlete: Record<string, string[]> = {}
  for (const m of (members ?? []) as TeamMember[]) {
    teamsByAthlete[m.athlete_id] = [...(teamsByAthlete[m.athlete_id] ?? []), m.team_id]
  }

  const teamIdsOf: Record<string, string[]> = {}
  for (const a of (athletes ?? []) as Athlete[]) {
    if (a.profile_id) teamIdsOf[a.profile_id] = teamsByAthlete[a.id] ?? []
  }

  return (
    <UserManager
      users={(data ?? []) as Profile[]}
      athletes={(athletes ?? []) as Athlete[]}
      teams={(teams ?? []) as Team[]}
      roles={(roles ?? []) as Role[]}
      teamIdsOf={teamIdsOf}
      staffTeamIdsOf={staffTeamIdsOf}
      meId={me.id}
      isAdmin={me.role === 'admin'}
      canEdit={canEdit(perms, 'utenti')}
      canManageAccounts={hasAdminKey() && canEdit(perms, 'utenti')}
    />
  )
}
