import { notFound } from 'next/navigation'
import { Nav } from '@/components/nav'
import { AttendanceBoard } from '@/components/attendance-board'
import { isStaff, myAthlete, requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { formatEventDate } from '@/lib/format'
import type { Athlete, Event, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const me = await myAthlete(profile)
  const staff = isStaff(profile)

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const event = data as Event

  const [{ data: athletes }, { data: absences }, { data: team }, { data: members }] =
    await Promise.all([
      supabase
        .from('athletes')
        .select('*')
        .eq('active', true)
        .order('last_name', { ascending: true }),
      supabase.from('absences').select('athlete_id, injury').eq('event_id', id),
      event.team_id
        ? supabase.from('teams').select('*').eq('id', event.team_id).maybeSingle()
        : Promise.resolve({ data: null }),
      event.team_id
        ? supabase.from('team_members').select('athlete_id').eq('team_id', event.team_id)
        : Promise.resolve({ data: null }),
    ])

  // Convocati: la rosa della squadra dell'evento. Senza squadra, tutti.
  const roster = (athletes ?? []) as Athlete[]
  const called = event.team_id
    ? (() => {
        const ids = new Set(
          ((members ?? []) as { athlete_id: string }[]).map((m) => m.athlete_id)
        )
        return roster.filter((a) => ids.has(a.id))
      })()
    : roster

  const teamName = event.team_id
    ? ((team as Team | null)?.name ?? 'Squadra rimossa')
    : null

  return (
    <>
      <Nav profile={profile} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Appello</p>
          <h1 className="h1">{formatEventDate(event.starts_at)}</h1>
          {teamName && <p className="sub">{teamName}</p>}
        </div>

        <AttendanceBoard
          event={event}
          athletes={called}
          lockedAthleteId={staff ? null : (me?.id ?? null)}
          canClose={staff}
          initialAbsent={
            (absences ?? []) as { athlete_id: string; injury: boolean }[]
          }
          userId={profile.id}
        />
      </main>
    </>
  )
}
