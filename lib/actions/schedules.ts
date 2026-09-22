'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { guard } from '@/lib/auth'
import type { ActionResult } from '@/lib/types'

function refresh() {
  revalidatePath('/atleti')
  revalidatePath('/stats')
}

/**
 * "Marco viene il giovedì": i giorni in cui l'atleta e' atteso agli
 * allenamenti. Gli altri escono dalle sue percentuali. Il periodo e'
 * facoltativo e serve quando la situazione cambia a meta' stagione:
 * si chiude la regola vecchia e se ne apre una nuova, cosi' le
 * percentuali gia' maturate restano quelle.
 */
export async function createSchedule(
  athleteId: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied

  const weekdays = formData
    .getAll('weekdays')
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)

  if (weekdays.length === 0) {
    return { error: 'Scegli almeno un giorno: senza, la regola escluderebbe tutto.' }
  }

  const from = String(formData.get('from_date') ?? '').trim()
  const to = String(formData.get('to_date') ?? '').trim()

  if (from && to && to < from) {
    return { error: 'La data di fine precede quella di inizio.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('athlete_schedules')
    .insert({
      athlete_id: athleteId,
      weekdays: [...new Set(weekdays)].sort(),
      from_date: from || null,
      to_date: to || null,
      note: String(formData.get('note') ?? '').trim() || null,
    })
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Regola non salvata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

/** Chiude una regola a una certa data invece di cancellarla. */
export async function closeSchedule(
  id: string,
  toDate: string
): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied

  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return { error: 'Data non valida.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('athlete_schedules')
    .update({ to_date: toDate })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh()
  return { ok: true }
}

/**
 * Elimina la regola. Attenzione: le percentuali gia' calcolate cambiano
 * subito, perche' tornano a contare tutti gli allenamenti. Per non
 * riscrivere il passato c'e' closeSchedule.
 */
export async function deleteSchedule(id: string): Promise<ActionResult> {
  const denied = await guard('atleti')
  if (denied) return denied

  const supabase = await createClient()
  const { error } = await supabase.from('athlete_schedules').delete().eq('id', id)
  if (error) return { error: error.message }

  refresh()
  return { ok: true }
}
