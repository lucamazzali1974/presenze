import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  NO_PERMS,
  canEdit,
  canView,
  landingFor,
  readPerms,
  type Level,
  type Perms,
  type Section,
} from '@/lib/permissions'
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
 * La matrice di permessi dell'utente collegato, presa dal database:
 * la calcola my_permissions(), cosi' e' la stessa cosa che vedono le
 * policy RLS e non due elenchi da tenere allineati a mano.
 */
export async function myPermissions(): Promise<Perms> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_permissions')

  // Senza risposta si nega tutto: /profilo resta comunque raggiungibile.
  if (error) return NO_PERMS

  return readPerms(data)
}

export async function can(section: Section, level: Level = 'edit') {
  const perms = await myPermissions()
  return level === 'edit' ? canEdit(perms, section) : canView(perms, section)
}

export type Access = { profile: Profile; perms: Perms }

/**
 * Gate di pagina: profilo attivo + sezione consentita. Chi non ce l'ha
 * finisce sulla prima pagina che gli spetta, non su un errore.
 */
export async function requireSection(
  section: Section,
  level: Level = 'view'
): Promise<Access> {
  const profile = await requireProfile()
  const perms = await myPermissions()

  const ok = level === 'edit' ? canEdit(perms, section) : canView(perms, section)
  if (!ok) redirect(landingFor(perms))

  return { profile, perms }
}

/** Per le pagine senza sezione (il profilo): serve solo la matrice per il menu. */
export async function requireAccess(): Promise<Access> {
  const profile = await requireProfile()
  const perms = await myPermissions()
  return { profile, perms }
}

/**
 * Esito standard per le server action: invece di un redirect, un errore
 * leggibile che il form mostra sotto al pulsante.
 */
export async function guard(
  section: Section,
  level: Level = 'edit'
): Promise<{ error: string } | null> {
  const profile = await requireProfile()
  if (profile.role === 'admin') return null

  return (await can(section, level))
    ? null
    : { error: 'Non hai i permessi per questa operazione.' }
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
