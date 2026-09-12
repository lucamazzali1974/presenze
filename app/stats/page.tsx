import { Nav } from '@/components/nav'
import { StatsView, type ClosedSummary, type StatsRow } from '@/components/stats-view'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, AttendanceStat, EventType } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // La rosa si legge a parte: cosi' in elenco compaiono tutti, anche chi
  // non ha ancora nessun evento a referto (la vista fa un join e per lui
  // non produrrebbe nessuna riga).
  const [statsRes, athletesRes, closedRes] = await Promise.all([
    supabase.from('attendance_stats').select('*'),
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    supabase
      .from('events')
      .select('type, starts_at')
      .not('closed_at', 'is', null)
      .is('archive_id', null),
  ])

  const error =
    statsRes.error?.message ??
    athletesRes.error?.message ??
    closedRes.error?.message ??
    null

  const stats = (statsRes.data ?? []) as AttendanceStat[]
  const athletes = (athletesRes.data ?? []) as Athlete[]
  const closedEvents = (closedRes.data ?? []) as {
    type: EventType
    starts_at: string
  }[]

  const byAthlete = new Map<
    string,
    { training: AttendanceStat | null; match: AttendanceStat | null }
  >()

  for (const s of stats) {
    const found = byAthlete.get(s.athlete_id) ?? { training: null, match: null }
    found[s.type] = s
    byAthlete.set(s.athlete_id, found)
  }

  const rows: StatsRow[] = athletes
    .map((a) => {
      const found = byAthlete.get(a.id)
      return {
        id: a.id,
        sort: `${a.last_name} ${a.first_name}`,
        athlete: a,
        training: found?.training ?? null,
        match: found?.match ?? null,
      }
    })
    .sort((a, b) => a.sort.localeCompare(b.sort, 'it'))

  const dates = closedEvents.map((e) => e.starts_at).sort()

  const closed: ClosedSummary = {
    total: closedEvents.length,
    training: closedEvents.filter((e) => e.type === 'training').length,
    match: closedEvents.filter((e) => e.type === 'match').length,
    firstAt: dates[0] ?? null,
  }

  return (
    <>
      <Nav profile={profile} />
      <StatsView
        rows={rows}
        closed={closed}
        loadError={error}
        isAdmin={profile.role === 'admin'}
      />
    </>
  )
}
