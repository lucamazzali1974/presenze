import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, Profile } from '@/lib/types'

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

/**
 * La scheda atleta collegata a questo account, se ce n'e' una.
 * Solo il ruolo 'athlete' ne ha bisogno: allenatori e admin compilano
 * l'appello di tutti, non il proprio.
 */
export async function myAthlete(profile: Profile): Promise<Athlete | null> {
  if (profile.role !== 'athlete') return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('athletes')
    .select('*')
    .eq('profile_id', profile.id)
    .maybeSingle()

  return (data as Athlete) ?? null
}

/** Lo staff: chi fa l'appello di tutti. Speculare a is_staff() nel database. */
export function isStaff(profile: Profile) {
  return profile.role === 'user' || profile.role === 'admin'
}
