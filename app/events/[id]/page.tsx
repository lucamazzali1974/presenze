import { notFound } from 'next/navigation'
import { Nav } from '@/components/nav'
import { AttendanceBoard } from '@/components/attendance-board'
import { MatchLineups, type LineupData } from '@/components/match-lineups'
import { isStaff, myAthlete, requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import { formatEventDate } from '@/lib/format'
import type {
  Athlete,
  Event,
  Lineup,
  LineupMember,
  Score,
  Team,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { profile, perms } = await requireSection('appello')
  const supabase = await createClient()
  const me = await myAthlete(profile)
  const staff = isStaff(profile)
  const canMark = canEdit(perms, 'appello')

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const event = data as Event

  const [
    { data: athletes },
    { data: absences },
    { data: team },
    { data: members },
    { data: lineupsData },
    { data: lineupMembers },
  ] = await Promise.all([
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    supabase
      .from('absences')
      .select('athlete_id, injury, not_called')
      .eq('event_id', id),
    event.team_id
      ? supabase.from('teams').select('*').eq('id', event.team_id).maybeSingle()
      : Promise.resolve({ data: null }),
    event.team_id
      ? supabase.from('team_members').select('athlete_id').eq('team_id', event.team_id)
      : Promise.resolve({ data: null }),
    // Formazioni, convocati e marcature: solo le partite ne hanno.
    event.type === 'match'
      ? supabase.from('lineups').select('*').eq('event_id', id).order('sort')
      : Promise.resolve({ data: null }),
    event.type === 'match'
      ? supabase.from('lineup_members').select('*').eq('event_id', id)
      : Promise.resolve({ data: null }),
  ])

  const lineups = (lineupsData ?? []) as Lineup[]
  const lineupIds = lineups.map((l) => l.id)

  // Le marcature aspettano di sapere quali formazioni esistono: un giro
  // in piu', ma solo sulle partite che ne hanno.
  const { data: scoreRows } =
    lineupIds.length > 0
      ? await supabase
          .from('scores')
          .select('lineup_id, athlete_id, kind, qty')
          .in('lineup_id', lineupIds)
      : { data: null }

  // La rosa della squadra dell'evento. Senza squadra, tutti.
  const roster = (athletes ?? []) as Athlete[]
  const squad = event.team_id
    ? (() => {
        const ids = new Set(
          ((members ?? []) as { athlete_id: string }[]).map((m) => m.athlete_id)
        )
        return roster.filter((a) => ids.has(a.id))
      })()
    : roster

  /*
   * L'appello si fa su tutta la squadra, formazioni o no: chi non c'e'
   * e' assente. Per togliere dai conti chi non era atteso c'e' il flag
   * "non convocato" sul tabellone (e il pulsante nelle formazioni, che
   * lo mette a tutti quelli rimasti fuori in un colpo solo).
   */
  const memberRows = (lineupMembers ?? []) as LineupMember[]

  const lineupData: LineupData[] = lineups.map((lineup) => ({
    lineup,
    memberIds: memberRows
      .filter((m) => m.lineup_id === lineup.id)
      .map((m) => m.athlete_id),
    scores: ((scoreRows ?? []) as Score[]).filter((s) => s.lineup_id === lineup.id),
  }))

  const teamName = event.team_id
    ? ((team as Team | null)?.name ?? 'Squadra rimossa')
    : null

  return (
    <>
      <Nav perms={perms} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Appello</p>
          <h1 className="h1">{formatEventDate(event.starts_at)}</h1>
          {teamName && <p className="sub">{teamName}</p>}
        </div>

        <AttendanceBoard
          event={event}
          athletes={squad}
          lockedAthleteId={staff ? null : (me?.id ?? null)}
          canClose={staff && canMark}
          canMark={canMark}
          initialAbsent={
            (absences ?? []) as {
              athlete_id: string
              injury: boolean
              not_called: boolean
            }[]
          }
          userId={profile.id}
        />

        {event.type === 'match' && (
          <MatchLineups
            event={event}
            lineups={lineupData}
            athletes={squad}
            canEdit={staff && canMark}
          />
        )}
      </main>
    </>
  )
}
