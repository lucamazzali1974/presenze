import { Nav } from '@/components/nav'
import { StatsView, type ClosedSummary, type StatsRow } from '@/components/stats-view'
import { isStaff, myAthlete, requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import { byType, forTeam, sumStats } from '@/lib/stats'
import type { MatchScorer, MatchStatsData } from '@/components/match-stats'
import {
  SCORE_POINTS,
  type Athlete,
  type AttendanceStatRow,
  type EventType,
  type MatchResult,
  type Score,
  type Team,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>
}) {
  const { profile, perms } = await requireSection('percentuali')
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

  // Le partite a referto: una riga per formazione giocata.
  const { data: resultsData } = await supabase
    .from('match_results')
    .select('*')
    .order('starts_at', { ascending: false })

  const allResults = (resultsData ?? []) as MatchResult[]

  // Le marcature di quelle formazioni, per la classifica e per lo storico.
  const lineupIds = allResults.map((r) => r.lineup_id)
  const { data: scoreData } =
    lineupIds.length > 0
      ? await supabase
          .from('scores')
          .select('lineup_id, athlete_id, kind, qty')
          .in('lineup_id', lineupIds)
      : { data: null }

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

  // Al giocatore si mostra solo la sua squadra: le altre non lo riguardano.
  const shownTeams = staff
    ? teams
    : teams.filter((t) =>
        members.some((m) => m.team_id === t.id && m.athlete_id === me?.id)
      )

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

  /*
   * Le partite seguono lo stesso filtro squadra delle percentuali: gli
   * eventi senza squadra riguardano tutti e restano sempre in elenco.
   */
  const results = team
    ? allResults.filter((r) => r.team_id === team || r.team_id === null)
    : allResults

  const visibleLineups = new Set(results.map((r) => r.lineup_id))
  const athleteById = new Map(athletes.map((a) => [a.id, a]))

  // Da contatori sparsi a una riga per atleta, e a una per formazione.
  const perAthlete: Record<string, MatchScorer> = {}
  const byLineup: Record<string, Record<string, MatchScorer>> = {}

  function blank(athleteId: string): MatchScorer {
    const a = athleteById.get(athleteId)
    return {
      athlete_id: athleteId,
      athlete: a ?? { first_name: 'Giocatore', last_name: 'rimosso', nickname: null },
      tries: 0,
      conversions: 0,
      penalties: 0,
      drops: 0,
      points: 0,
    }
  }

  const FIELD = {
    try: 'tries',
    conversion: 'conversions',
    penalty: 'penalties',
    drop: 'drops',
  } as const

  for (const s of (scoreData ?? []) as Score[]) {
    if (!visibleLineups.has(s.lineup_id) || s.qty <= 0) continue
    // Qui vale la stessa regola delle percentuali: il giocatore vede i
    // propri numeri, non quelli dei compagni. Il tabellino completo di
    // una partita resta sulla pagina della partita.
    if (!staff && s.athlete_id !== me?.id) continue

    const points = s.qty * SCORE_POINTS[s.kind]

    const total = (perAthlete[s.athlete_id] ??= blank(s.athlete_id))
    total[FIELD[s.kind]] += s.qty
    total.points += points

    const lineup = (byLineup[s.lineup_id] ??= {})
    const row = (lineup[s.athlete_id] ??= blank(s.athlete_id))
    row[FIELD[s.kind]] += s.qty
    row.points += points
  }

  const matches: MatchStatsData = {
    results,
    scorers: Object.values(perAthlete).sort(
      (a, b) => b.points - a.points || b.tries - a.tries
    ),
    byLineup: Object.fromEntries(
      Object.entries(byLineup).map(([id, map]) => [
        id,
        Object.values(map).sort((a, b) => b.points - a.points),
      ])
    ),
    perAthlete,
  }

  return (
    <>
      <Nav perms={perms} />
      <StatsView
        rows={rows}
        closed={closed}
        teams={shownTeams}
        selectedTeam={team}
        loadError={error}
        canArchive={canEdit(perms, 'archivio')}
        selfOnly={!staff}
        matches={matches}
      />
    </>
  )
}
