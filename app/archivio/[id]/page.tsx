import { notFound } from 'next/navigation'
import { Nav } from '@/components/nav'
import { ArchiveDetail } from '@/components/archive-detail'
import { requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import type { Archive, Event } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { profile, perms } = await requireSection('archivio')
  const supabase = await createClient()

  const { data: archive } = await supabase
    .from('archives')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!archive) notFound()

  const [{ data: events }, { data: visible }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('archive_id', id)
      .order('starts_at', { ascending: true }),
    // Gli atleti che questo utente puo' vedere: la RLS li filtra per squadra.
    supabase.from('athletes').select('id'),
  ])

  /*
   * La fotografia e' di tutta l'installazione. Lo staff ne vede solo i
   * giocatori delle sue squadre; l'admin tutti.
   */
  const visibleIds = new Set(((visible ?? []) as { id: string }[]).map((a) => a.id))
  const full = archive as Archive
  const shown: Archive =
    profile.role === 'admin'
      ? full
      : {
          ...full,
          snapshot: (full.snapshot ?? []).filter((s) => visibleIds.has(s.athlete_id)),
        }

  return (
    <>
      <Nav perms={perms} />
      <ArchiveDetail
        archive={shown}
        events={(events ?? []) as Event[]}
        canEdit={profile.role === 'admin' && canEdit(perms, 'archivio')}
      />
    </>
  )
}
