import { EventManager } from '@/components/event-manager'
import { requireSection } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Event, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  // La pagina di gestione vuole il permesso di modifica: chi ha solo la
  // lettura resta su /calendario.
  await requireSection('calendario', 'edit')
  const supabase = await createClient()
  const now = new Date().toISOString()

  const [{ data: upcoming }, { data: past }, { data: teams }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .is('archive_id', null)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(200),
    supabase
      .from('events')
      .select('*')
      .is('archive_id', null)
      .lt('starts_at', now)
      .order('starts_at', { ascending: false })
      .limit(200),
    supabase.from('teams').select('*').order('name', { ascending: true }),
  ])

  return (
    <EventManager
      upcoming={(upcoming ?? []) as Event[]}
      past={(past ?? []) as Event[]}
      teams={(teams ?? []) as Team[]}
    />
  )
}
