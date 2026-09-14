'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin, requireProfile } from '@/lib/auth'
import { localToISO } from '@/lib/format'

/** Stringa vuota dal <select> = "tutta la societa'", cioe' team_id null. */
function readTeamId(formData: FormData) {
  const raw = String(formData.get('team_id') ?? '').trim()
  return raw || null
}

export async function createEvent(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const type = String(formData.get('type') ?? 'training')
  const date = String(formData.get('date') ?? '')
  const time = String(formData.get('time') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim()

  if (!date || !time) return { error: 'Data e ora sono obbligatorie.' }

  const { data, error } = await supabase
    .from('events')
    .insert({
      type,
      starts_at: localToISO(date, time),
      title: title || null,
      location: location || null,
      team_id: readTeamId(formData),
    })
    .select('id')

  if (error) return { error: error.message }

  // Senza .select() un insert bloccato dalla RLS tornerebbe senza errore
  // e senza aver scritto niente: silenzio indistinguibile dal successo.
  if (!data || data.length === 0) {
    return { error: 'Data non creata: permessi insufficienti.' }
  }

  revalidatePath('/admin/events')
  revalidatePath('/admin/teams')
  revalidatePath('/')
  return { ok: true }
}

export async function createRecurringEvents(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const type = String(formData.get('type') ?? 'training')
  const time = String(formData.get('time') ?? '')
  const from = String(formData.get('from') ?? '')
  const to = String(formData.get('to') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim()
  const weekdays = formData
    .getAll('weekdays')
    .map((d) => Number(d))
    .filter((d) => d >= 1 && d <= 7)

  if (!time || !from || !to) return { error: 'Compila ora, data inizio e fine.' }
  if (weekdays.length === 0) return { error: 'Scegli almeno un giorno.' }
  if (to < from) return { error: 'La data di fine precede quella di inizio.' }

  // La generazione delle date la fa Postgres: gestisce il cambio dell'ora
  // legale senza spostare l'orario degli allenamenti.
  const { error } = await supabase.rpc('create_recurring_events', {
    p_type: type,
    p_weekdays: weekdays,
    p_time: time,
    p_from: from,
    p_to: to,
    p_title: title || null,
    p_location: location || null,
    p_team_id: readTeamId(formData),
  })

  if (error) return { error: error.message }

  revalidatePath('/admin/events')
  revalidatePath('/')
  return { ok: true }
}

export async function updateEvent(id: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const type = String(formData.get('type') ?? 'training')
  const date = String(formData.get('date') ?? '')
  const time = String(formData.get('time') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const location = String(formData.get('location') ?? '').trim()

  if (!date || !time) return { error: 'Data e ora sono obbligatorie.' }

  const { data, error } = await supabase
    .from('events')
    .update({
      type,
      starts_at: localToISO(date, time),
      title: title || null,
      location: location || null,
      team_id: readTeamId(formData),
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }

  if (!data || data.length === 0) {
    return {
      error:
        'Nessuna modifica salvata: la data non esiste piu\u2019 oppure non hai i permessi.',
    }
  }

  revalidatePath('/admin/events')
  revalidatePath('/')
  revalidatePath(`/events/${id}`)
  revalidatePath('/stats')
  return { ok: true }
}

export async function deleteEvent(id: string) {
  await requireAdmin()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Data non eliminata: permessi insufficienti.' }
  }

  revalidatePath('/admin/events')
  revalidatePath('/')
  revalidatePath('/stats')
  return { ok: true }
}

export async function deleteSeries(seriesId: string) {
  await requireAdmin()
  const supabase = await createClient()

  // Cancella solo le occorrenze future: quelle passate hanno gia' un appello.
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('series_id', seriesId)
    .gte('starts_at', new Date().toISOString())

  if (error) return { error: error.message }

  revalidatePath('/admin/events')
  revalidatePath('/')
  return { ok: true }
}

/** Chiude l'appello: da qui in poi l'evento entra nelle statistiche. */
export async function setEventClosed(id: string, closed: boolean) {
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('events')
    .update({ closed_at: closed ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Appello non aggiornato: permessi insufficienti.' }
  }

  revalidatePath('/')
  revalidatePath('/admin/events')
  revalidatePath(`/events/${id}`)
  revalidatePath('/stats')
  return { ok: true }
}
