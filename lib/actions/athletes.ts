'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { guard } from '@/lib/auth'
import type { ActionResult } from '@/lib/types'

/**
 * joined_on decide da quale evento in poi il giocatore viene conteggiato:
 * senza, il default del database e' la data di inserimento e tutti gli
 * appelli gia' chiusi prima resterebbero fuori dalle percentuali.
 */
function readJoinedOn(formData: FormData): {
  value: string | null
  error: string | null
} {
  const raw = String(formData.get('joined_on') ?? '').trim()
  if (!raw) return { value: null, error: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { value: null, error: 'La data di ingresso in rosa non \u00e8 valida.' }
  }
  return { value: raw, error: null }
}

export async function createAthlete(formData: FormData): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied
  const supabase = await createClient()

  const first_name = String(formData.get('first_name') ?? '').trim()
  const last_name = String(formData.get('last_name') ?? '').trim()
  const nickname = String(formData.get('nickname') ?? '').trim()

  if (!first_name || !last_name) {
    return { error: 'Nome e cognome sono obbligatori.' }
  }

  const joined = readJoinedOn(formData)
  if (joined.error) return { error: joined.error }

  const { error } = await supabase.from('athletes').insert({
    first_name,
    last_name,
    nickname: nickname || null,
    ...(joined.value ? { joined_on: joined.value } : {}),
  })

  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}

export async function updateAthlete(id: string, formData: FormData): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied
  const supabase = await createClient()

  const first_name = String(formData.get('first_name') ?? '').trim()
  const last_name = String(formData.get('last_name') ?? '').trim()
  const nickname = String(formData.get('nickname') ?? '').trim()

  if (!first_name || !last_name) {
    return { error: 'Nome e cognome sono obbligatori.' }
  }

  const joined = readJoinedOn(formData)
  if (joined.error) return { error: joined.error }

  const { error } = await supabase
    .from('athletes')
    .update({
      first_name,
      last_name,
      nickname: nickname || null,
      ...(joined.value ? { joined_on: joined.value } : {}),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}

export async function toggleAthleteActive(id: string, active: boolean): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied
  const supabase = await createClient()

  const { error } = await supabase
    .from('athletes')
    .update({ active })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}

export async function deleteAthlete(id: string): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied
  const supabase = await createClient()

  const { error } = await supabase.from('athletes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}

/**
 * Collega (o scollega, con null) una scheda atleta a un account.
 * Il vincolo unique in database garantisce che un account valga per un
 * solo giocatore: se provi a riusarlo esce un errore, non un doppione.
 */
export async function linkAthleteProfile(
  athleteId: string,
  profileId: string | null
): Promise<ActionResult> {
  // Il collegamento si fa da due pagine diverse — la rosa e gli utenti —
  // quindi basta avere in mano una delle due sezioni.
  const denied = (await guard('atleti')) && (await guard('utenti'))
  if (denied) return denied
  const supabase = await createClient()

  // Un account per un giocatore solo: se era gia' su un'altra scheda,
  // quella si libera qui. Farlo dal client sarebbero due chiamate in
  // corsa fra loro, e il vincolo unique ne farebbe fallire una.
  if (profileId) {
    const { error: freeError } = await supabase
      .from('athletes')
      .update({ profile_id: null })
      .eq('profile_id', profileId)
      .neq('id', athleteId)

    if (freeError) return { error: freeError.message }
  }

  const { data, error } = await supabase
    .from('athletes')
    .update({ profile_id: profileId })
    .eq('id', athleteId)
    .select('id')

  if (error) {
    if (error.code === '23505') {
      return { error: 'Questo account è già collegato a un altro giocatore.' }
    }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Collegamento non salvato: permessi insufficienti.' }
  }

  revalidatePath('/atleti')
  revalidatePath('/admin/users')
  revalidatePath('/stats')
  revalidatePath('/')
  return { ok: true }
}
