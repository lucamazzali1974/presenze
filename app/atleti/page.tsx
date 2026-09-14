import { Nav } from '@/components/nav'
import { AthleteManager } from '@/components/athlete-manager'
import { isStaff, myAthlete, requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { hasAdminKey } from '@/utils/supabase/admin'
import type { Athlete, Profile, Team, TeamMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AthletesPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'
  const supabase = await createClient()

  const me = await myAthlete(profile)
  const staff = isStaff(profile)

  // Chi non e' admin vede solo chi e' effettivamente in rosa.
  let query = supabase.from('athletes').select('*')
  if (!isAdmin) query = query.eq('active', true)

  const [{ data }, { data: teams }, { data: members }, { data: profiles }] =
    await Promise.all([
      query.order('active', { ascending: false }).order('last_name', { ascending: true }),
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase.from('team_members').select('*'),
      // Solo l'admin legge i profili altrui: per gli altri la RLS
      // restituirebbe comunque il solo profilo proprio.
      isAdmin
        ? supabase.from('profiles').select('*')
        : Promise.resolve({ data: null }),
    ])

  // Le squadre di ogni atleta, gia' pronte: l'elenco non deve rifare il giro.
  const teamsOf: Record<string, string[]> = {}
  const nameById = new Map(((teams ?? []) as Team[]).map((t) => [t.id, t.name]))
  for (const m of (members ?? []) as TeamMember[]) {
    const name = nameById.get(m.team_id)
    if (!name) continue
    teamsOf[m.athlete_id] = [...(teamsOf[m.athlete_id] ?? []), name]
  }

  // L'accesso di ogni giocatore, per mostrare nome utente e stato.
  const accountOf: Record<string, Profile> = {}
  const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))
  for (const a of (data ?? []) as Athlete[]) {
    const account = a.profile_id ? byId.get(a.profile_id) : undefined
    if (account) accountOf[a.id] = account
  }

  /*
   * Il giocatore vede i compagni di squadra, non tutta la societa'.
   * E' un filtro di visibilita', non una barriera: la RLS su athletes
   * resta aperta a ogni utente attivo, perche' il tabellone dell'appello
   * ha bisogno della rosa per contare i presenti anche sugli eventi
   * senza squadra.
   */
  const roster = (data ?? []) as Athlete[]

  const visible = (() => {
    if (staff || !me) return roster

    const myTeamIds = new Set(
      ((members ?? []) as TeamMember[])
        .filter((m) => m.athlete_id === me.id)
        .map((m) => m.team_id)
    )

    if (myTeamIds.size === 0) return roster.filter((a) => a.id === me.id)

    const teammates = new Set(
      ((members ?? []) as TeamMember[])
        .filter((m) => myTeamIds.has(m.team_id))
        .map((m) => m.athlete_id)
    )
    teammates.add(me.id)

    return roster.filter((a) => teammates.has(a.id))
  })()

  return (
    <>
      <Nav profile={profile} />
      <AthleteManager
        athletes={visible}
        teamsOf={teamsOf}
        hasTeams={((teams ?? []) as Team[]).length > 0}
        accountOf={accountOf}
        canCreateAccounts={isAdmin && hasAdminKey()}
        isAdmin={isAdmin}
      />
    </>
  )
}
