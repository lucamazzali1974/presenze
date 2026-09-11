import { notFound } from 'next/navigation'
import { Nav } from '@/components/nav'
import { AttendanceBoard } from '@/components/attendance-board'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { formatEventDate } from '@/lib/format'
import type { Athlete, Event } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const event = data as Event

  const [{ data: athletes }, { data: absences }] = await Promise.all([
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    supabase.from('absences').select('athlete_id, injury').eq('event_id', id),
  ])

  return (
    <>
      <Nav profile={profile} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Appello</p>
          <h1 className="h1">{formatEventDate(event.starts_at)}</h1>
        </div>

        <AttendanceBoard
          event={event}
          athletes={(athletes ?? []) as Athlete[]}
          initialAbsent={
            (absences ?? []) as { athlete_id: string; injury: boolean }[]
          }
          userId={profile.id}
        />
      </main>
    </>
  )
}
