import Link from 'next/link'
import { Nav } from '@/components/nav'
import { EventSwitch } from '@/components/event-switch'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, Event } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function nextEvent(type: 'training' | 'match') {
  const supabase = await createClient()

  // 4 ore di tolleranza: l'appello si compila anche a evento iniziato.
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('type', type)
    .is('archive_id', null)
    .gte('starts_at', since)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const event = data as Event

  const { data: absences } = await supabase
    .from('absences')
    .select('athlete_id, injury')
    .eq('event_id', event.id)

  return {
    event,
    absent: (absences ?? []) as { athlete_id: string; injury: boolean }[],
  }
}

export default async function Home() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const [{ data: athletes }, training, match] = await Promise.all([
    supabase
      .from('athletes')
      .select('*')
      .eq('active', true)
      .order('last_name', { ascending: true }),
    nextEvent('training'),
    nextEvent('match'),
  ])

  const roster = (athletes ?? []) as Athlete[]

  return (
    <>
      <Nav profile={profile} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Appello</p>
          <h1 className="h1">Prossimi impegni</h1>
          <p className="sub">
            {roster.length > 0
              ? `${roster.length} giocatori in rosa. Tutti presenti finché non segni il contrario.`
              : 'La rosa è ancora vuota.'}
          </p>
        </div>

        {roster.length === 0 ? (
          <div className="panel p-6">
            <p style={{ color: 'var(--color-muted)' }}>
              Senza giocatori non c’è appello da fare.
            </p>
            {profile.role === 'admin' && (
              <Link href="/atleti" className="btn btn-primary mt-5">
                Aggiungi i giocatori
              </Link>
            )}
          </div>
        ) : (
          <EventSwitch
            training={training}
            match={match}
            athletes={roster}
            userId={profile.id}
          />
        )}
      </main>
    </>
  )
}
