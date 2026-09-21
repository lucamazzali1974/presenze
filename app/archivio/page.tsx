import { Nav } from '@/components/nav'
import { ArchiveList } from '@/components/archive-list'
import { requireSection } from '@/lib/auth'
import { canEdit } from '@/lib/permissions'
import { createClient } from '@/utils/supabase/server'
import type { Archive } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const { perms } = await requireSection('archivio')
  const supabase = await createClient()

  const { data } = await supabase
    .from('archives')
    .select('*')
    .order('from_date', { ascending: false })

  return (
    <>
      <Nav perms={perms} />
      <ArchiveList
        archives={(data ?? []) as Archive[]}
        canEdit={canEdit(perms, 'archivio')}
      />
    </>
  )
}
