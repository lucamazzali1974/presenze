import { Nav } from '@/components/nav'
import { ArchiveList } from '@/components/archive-list'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Archive } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('archives')
    .select('*')
    .order('from_date', { ascending: false })

  return (
    <>
      <Nav profile={profile} />
      <ArchiveList
        archives={(data ?? []) as Archive[]}
        isAdmin={profile.role === 'admin'}
      />
    </>
  )
}
