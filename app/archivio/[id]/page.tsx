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
  const { perms } = await requireSection('archivio')
  const supabase = await createClient()

  const { data: archive } = await supabase
    .from('archives')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!archive) notFound()

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('archive_id', id)
    .order('starts_at', { ascending: true })

  return (
    <>
      <Nav perms={perms} />
      <ArchiveDetail
        archive={archive as Archive}
        events={(events ?? []) as Event[]}
        canEdit={canEdit(perms, 'archivio')}
      />
    </>
  )
}
