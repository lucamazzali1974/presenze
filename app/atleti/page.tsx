import { Nav } from '@/components/nav'
import { AthleteManager } from '@/components/athlete-manager'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, Team, TeamMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AthletesPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'
  const supabase = await createClient()

  // Chi non e' admin vede solo chi e' effettivamente in rosa.
  let query = supabase.from('athletes').select('*')
  if (!isAdmin) query = query.eq('active', true)

  const [{ data }, { data: teams }, { data: members }] = await Promise.all([
    query.order('active', { ascending: false }).order('last_name', { ascending: true }),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('team_members').select('*'),
  ])

  // Le squadre di ogni atleta, gia' pronte: l'elenco non deve rifare il giro.
  const teamsOf: Record<string, string[]> = {}
  const nameById = new Map(((teams ?? []) as Team[]).map((t) => [t.id, t.name]))
  for (const m of (members ?? []) as TeamMember[]) {
    const name = nameById.get(m.team_id)
    if (!name) continue
    teamsOf[m.athlete_id] = [...(teamsOf[m.athlete_id] ?? []), name]
  }

  return (
    <>
      <Nav profile={profile} />
      <AthleteManager
        athletes={(data ?? []) as Athlete[]}
        teamsOf={teamsOf}
        hasTeams={((teams ?? []) as Team[]).length > 0}
        isAdmin={isAdmin}
      />
    </>
  )
}
