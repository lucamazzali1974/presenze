import { Nav } from '@/components/nav'
import { StatsView, type ClosedSummary, type StatsRow } from '@/components/stats-view'
import { isStaff, myAthlete, requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { byType, forTeam, sumStats } from '@/lib/stats'
import type { Athlete, AttendanceStatRow, EventType, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const params = await searchParams

  const me = await myAthlete(profile)
  const staff = isStaff(profile)

  // La rosa si legge a parte: cosi' in elenco compaiono tutti, anche chi
  // non ha ancora nessun evento a referto (la vista fa un join e per lui
  // non produrrebbe nessuna riga).
  const [statsRes, athletesRes, closedRes, teamsRes, membersRes] = await Promise.all([
    supabase.from('attendance_stats').select('*'),
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    supabase
      .from('events')
      .select('type, starts_at, team_id')
      .not('closed_at', 'is', null)
      .is('archive_id', null),
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase.from('team_members').select('*'),
  ])

  const error =
    statsRes.error?.message ??
    athletesRes.error?.message ??
    closedRes.error?.message ??
    null

  const stats = (statsRes.data ?? []) as AttendanceStatRow[]
  const athletes = (athletesRes.data ?? []) as Athlete[]
  const teams = (teamsRes.data ?? []) as Team[]
  const members = (membersRes.data ?? []) as { team_id: string; athlete_id: string }[]
  const closedEvents = (closedRes.data ?? []) as {
    type: EventType
    starts_at: string
    team_id: string | null
  }[]

  const team = teams.some((t) => t.id === params.team) ? params.team! : null

  // Con una squadra scelta restano in elenco i suoi giocatori; gli eventi
  // senza squadra continuano a contare per tutti.
  const teamRoster = team
    ? (() => {
        const ids = new Set(
          members.filter((m) => m.team_id === team).map((m) => m.athlete_id)
        )
        return athletes.filter((a) => ids.has(a.id))
      })()
    : athletes

  /*
   * L'atleta vede solo se stesso. La vista attendance_stats gia' gli
   * restituisce la sola riga sua, ma l'elenco qui nasce dalla tabella
   * athletes: senza questo filtro vedrebbe i compagni tutti a "—".
   */
  const listed = staff ? teamRoster : teamRoster.filter((a) => a.id === me?.id)

  const byAthlete = new Map<string, AttendanceStatRow[]>()
  for (const s of stats) {
    byAthlete.set(s.athlete_id, [...(byAthlete.get(s.athlete_id) ?? []), s])
  }

  const rows: StatsRow[] = listed
    .map((a) => {
      const mine = forTeam(byAthlete.get(a.id) ?? [], team)
      return {
        id: a.id,
        sort: `${a.last_name} ${a.first_name}`,
        athlete: a,
        training: sumStats(byType(mine, 'training')),
        match: sumStats(byType(mine, 'match')),
      }
    })
    .sort((a, b) => a.sort.localeCompare(b.sort, 'it'))

  const relevant = team
    ? closedEvents.filter((e) => e.team_id === team || e.team_id === null)
    : closedEvents

  const dates = relevant.map((e) => e.starts_at).sort()

  const closed: ClosedSummary = {
    total: relevant.length,
    training: relevant.filter((e) => e.type === 'training').length,
    match: relevant.filter((e) => e.type === 'match').length,
    firstAt: dates[0] ?? null,
  }

  return (
    <>
      <Nav profile={profile} />
      <StatsView
        rows={rows}
        closed={closed}
        teams={teams}
        selectedTeam={team}
        loadError={error}
        isAdmin={profile.role === 'admin'}
        selfOnly={!staff}
      />
    </>
  )
}
