import { Nav } from '@/components/nav'
import { AthleteManager } from '@/components/athlete-manager'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Athlete } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AthletesPage() {
  const profile = await requireProfile()
  const isAdmin = profile.role === 'admin'
  const supabase = await createClient()

  // Chi non e' admin vede solo chi e' effettivamente in rosa.
  let query = supabase.from('athletes').select('*')
  if (!isAdmin) query = query.eq('active', true)

  const { data } = await query
    .order('active', { ascending: false })
    .order('last_name', { ascending: true })

  return (
    <>
      <Nav profile={profile} />
      <AthleteManager athletes={(data ?? []) as Athlete[]} isAdmin={isAdmin} />
    </>
  )
}
