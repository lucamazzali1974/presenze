import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Profile } from '@/lib/types'

/**
 * Legge il profilo dell'utente corrente. Il middleware ha gia' filtrato,
 * ma le pagine ricontrollano: il middleware e' UX, questo e' il gate vero
 * lato server (e sotto c'e' comunque la RLS).
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.status !== 'active') redirect('/pending')

  return profile as Profile
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile()
  if (profile.role !== 'admin') redirect('/')
  return profile
}
