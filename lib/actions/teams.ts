'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth'

function refresh() {
  revalidatePath('/admin/teams')
  revalidatePath('/admin/events')
  revalidatePath('/atleti')
  revalidatePath('/stats')
  revalidatePath('/')
}

export async function createTeam(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Il nome della squadra è obbligatorio.' }

  const { data, error } = await supabase
    .from('teams')
    .insert({ name })
    .select('id')

  if (error) {
    // 23505 = unique_violation sul nome.
    if (error.code === '23505') return { error: 'Esiste già una squadra con questo nome.' }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Squadra non creata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

export async function renameTeam(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Il nome della squadra è obbligatorio.' }

  const { data, error } = await supabase
    .from('teams')
    .update({ name })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: 'Esiste già una squadra con questo nome.' }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

export async function toggleTeamActive(id: string, active: boolean) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('teams').update({ active }).eq('id', id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

/**
 * Eliminare la squadra non tocca ne' atleti ne' eventi: l'appartenenza
 * sparisce (cascade) e gli eventi tornano "di tutta la societa'"
 * (team_id a null), quindi le presenze gia' registrate restano valide.
 */
export async function deleteTeam(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

/** Riscrive la rosa della squadra: prima toglie, poi inserisce la lista nuova. */
export async function setTeamMembers(teamId: string, athleteIds: string[]) {
  await requireAdmin()
  const supabase = await createClient()

  const { error: delError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)

  if (delError) return { error: delError.message }

  if (athleteIds.length > 0) {
    const { error } = await supabase
      .from('team_members')
      .insert(athleteIds.map((athlete_id) => ({ team_id: teamId, athlete_id })))

    if (error) return { error: error.message }
  }

  refresh()
  return { ok: true }
}
