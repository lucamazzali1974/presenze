import { TeamManager } from '@/components/team-manager'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, Team, TeamMember } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TeamsPage() {
  const supabase = await createClient()

  const [teamsRes, athletesRes, membersRes, eventsRes] = await Promise.all([
    supabase.from('teams').select('*').order('name', { ascending: true }),
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    supabase.from('team_members').select('*'),
    supabase.from('events').select('team_id').is('archive_id', null),
  ])

  const error =
    teamsRes.error?.message ??
    athletesRes.error?.message ??
    membersRes.error?.message ??
    null

  const events = (eventsRes.data ?? []) as { team_id: string | null }[]
  const eventCount: Record<string, number> = {}
  for (const e of events) {
    const key = e.team_id ?? 'none'
    eventCount[key] = (eventCount[key] ?? 0) + 1
  }

  return (
    <TeamManager
      teams={(teamsRes.data ?? []) as Team[]}
      athletes={(athletesRes.data ?? []) as Athlete[]}
      members={(membersRes.data ?? []) as TeamMember[]}
      eventCount={eventCount}
      loadError={error}
    />
  )
}
