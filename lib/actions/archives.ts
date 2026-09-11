'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth'

type Result = { ok?: true; error?: string }

function refresh() {
  revalidatePath('/')
  revalidatePath('/stats')
  revalidatePath('/archivio')
  revalidatePath('/admin/events')
}

/**
 * Archivia un periodo: fotografa le percentuali e toglie gli eventi
 * dal calendario e dalle statistiche correnti.
 */
export async function createArchive(formData: FormData): Promise<Result> {
  await requireAdmin()
  const supabase = await createClient()

  const name = String(formData.get('name') ?? '').trim()
  const from = String(formData.get('from') ?? '')
  const to = String(formData.get('to') ?? '')

  if (!from || !to) return { error: 'Indica data di inizio e di fine.' }
  if (to < from) return { error: 'La data di fine precede quella di inizio.' }

  const { error } = await supabase.rpc('create_archive', {
    p_name: name || `Periodo ${from} – ${to}`,
    p_from: from,
    p_to: to,
  })

  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

/** Riporta gli eventi nel calendario corrente e rimuove l'archivio. */
export async function restoreArchive(id: string): Promise<Result> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.rpc('restore_archive', { p_id: id })
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}

/** Elimina per sempre eventi, presenze e archivio. */
export async function purgeArchive(id: string): Promise<Result> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.rpc('purge_archive', { p_id: id })
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}
