import { Nav } from '@/components/nav'
import { StatsView, type StatsRow } from '@/components/stats-view'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { AttendanceStat } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase.from('attendance_stats').select('*')
  const stats = (data ?? []) as AttendanceStat[]

  const byAthlete = new Map<string, StatsRow>()
  for (const s of stats) {
    const row =
      byAthlete.get(s.athlete_id) ??
      ({
        id: s.athlete_id,
        sort: `${s.last_name} ${s.first_name}`,
        athlete: s,
        training: null,
        match: null,
      } as StatsRow)
    row[s.type] = s
    byAthlete.set(s.athlete_id, row)
  }

  const rows = [...byAthlete.values()].sort((a, b) =>
    a.sort.localeCompare(b.sort, 'it')
  )

  return (
    <>
      <Nav profile={profile} />
      <StatsView rows={rows} isAdmin={profile.role === 'admin'} />
    </>
  )
}
