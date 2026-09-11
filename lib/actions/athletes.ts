'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function createAthlete(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const first_name = String(formData.get('first_name') ?? '').trim()
  const last_name = String(formData.get('last_name') ?? '').trim()
  const nickname = String(formData.get('nickname') ?? '').trim()

  if (!first_name || !last_name) {
    return { error: 'Nome e cognome sono obbligatori.' }
  }

  const { error } = await supabase.from('athletes').insert({
    first_name,
    last_name,
    nickname: nickname || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
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

  const { error } = await supabase
    .from('athletes')
    .update({ first_name, last_name, nickname: nickname || null })
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
  return { ok: true }
}

export async function deleteAthlete(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('athletes').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/atleti')
  revalidatePath('/')
  return { ok: true }
}
