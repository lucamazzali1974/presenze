import { notFound } from 'next/navigation'
import { Nav } from '@/components/nav'
import { ArchiveDetail } from '@/components/archive-detail'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Archive, Event } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireProfile()
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
      <Nav profile={profile} />
      <ArchiveDetail
        archive={archive as Archive}
        events={(events ?? []) as Event[]}
        isAdmin={profile.role === 'admin'}
      />
    </>
  )
}
