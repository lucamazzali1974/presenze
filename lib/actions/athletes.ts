'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth'

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

export async function createAthlete(formData: FormData) {
  await requireAdmin()
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

export async function updateAthlete(id: string, formData: FormData) {
  await requireAdmin()
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

export async function toggleAthleteActive(id: string, active: boolean) {
  await requireAdmin()
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

export async function deleteAthlete(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('athletes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}
