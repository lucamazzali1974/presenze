'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { guard } from '@/lib/auth'
import { localToISO } from '@/lib/format'
import { SCORE_KINDS, type ActionResult, type Lineup, type ScoreKind } from '@/lib/types'

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`)
  revalidatePath('/')
  revalidatePath('/stats')
  revalidatePath('/calendario')
}

/**
 * Orario della formazione. Arriva come sola ora ("11:30"): la data e'
 * quella della partita, passata dal form, perche' una formazione non
 * gioca in un altro giorno.
 */
function readTime(formData: FormData, field: string, date: string) {
  const time = String(formData.get(field) ?? '').trim()
  if (!time || !date) return null
  return localToISO(date, time)
}

function readScore(formData: FormData, field: string) {
  const raw = String(formData.get(field) ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 999) return NaN
  return n
}

export async function createLineup(
  eventId: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Dai un nome alla formazione (es. «Squadra A»).' }

  const date = String(formData.get('date') ?? '')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lineups')
    .insert({
      event_id: eventId,
      name,
      starts_at: readTime(formData, 'time', date),
      meet_at: readTime(formData, 'meet_time', date),
      opponent: String(formData.get('opponent') ?? '').trim() || null,
      // Le nuove vanno in fondo, a distanza, cosi' restano riordinabili.
      sort: Number(formData.get('sort') ?? 100) || 100,
    })
    .select('id')

  if (error) {
    if (error.code === '23505') {
      return { error: 'Esiste già una formazione con questo nome per questa partita.' }
    }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Formazione non creata: permessi insufficienti.' }
  }

  refresh(eventId)
  return { ok: true }
}

/** Nome, orari, avversario e risultato: un solo salvataggio per scheda. */
export async function updateLineup(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Dai un nome alla formazione.' }

  const date = String(formData.get('date') ?? '')

  const pf = readScore(formData, 'points_for')
  const pa = readScore(formData, 'points_against')
  if (Number.isNaN(pf) || Number.isNaN(pa)) {
    return { error: 'Il punteggio dev’essere un numero intero da 0 in su.' }
  }

  // Mezzo risultato non e' un risultato: o tutti e due, o nessuno.
  if ((pf === null) !== (pa === null)) {
    return { error: 'Inserisci tutti e due i punteggi, o lascia il risultato vuoto.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lineups')
    .update({
      name,
      starts_at: readTime(formData, 'time', date),
      meet_at: readTime(formData, 'meet_time', date),
      opponent: String(formData.get('opponent') ?? '').trim() || null,
      points_for: pf,
      points_against: pa,
    })
    .eq('id', id)
    .select('event_id')

  if (error) {
    if (error.code === '23505') {
      return { error: 'Esiste già una formazione con questo nome per questa partita.' }
    }
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh((data[0] as { event_id: string }).event_id)
  return { ok: true }
}

export async function deleteLineup(id: string): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const supabase = await createClient()

  const { data: lineup } = await supabase
    .from('lineups')
    .select('event_id')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('lineups').delete().eq('id', id)
  if (error) return { error: error.message }

  if (lineup) refresh((lineup as { event_id: string }).event_id)
  return { ok: true }
}

/**
 * Riscrive i convocati di una formazione. Chi entra qui esce dalle altre
 * formazioni della stessa partita: un atleta gioca in una squadra sola, e
 * il vincolo unique in database farebbe altrimenti fallire il salvataggio
 * con un errore che non dice niente.
 */
export async function setLineupMembers(
  lineupId: string,
  athleteIds: string[]
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const supabase = await createClient()

  const { data: lineup } = await supabase
    .from('lineups')
    .select('id, event_id')
    .eq('id', lineupId)
    .maybeSingle()

  if (!lineup) return { error: 'Formazione non trovata.' }
  const eventId = (lineup as Pick<Lineup, 'id' | 'event_id'>).event_id

  if (athleteIds.length > 0) {
    const { error: freeError } = await supabase
      .from('lineup_members')
      .delete()
      .eq('event_id', eventId)
      .neq('lineup_id', lineupId)
      .in('athlete_id', athleteIds)

    if (freeError) return { error: freeError.message }
  }

  const { error: delError } = await supabase
    .from('lineup_members')
    .delete()
    .eq('lineup_id', lineupId)

  if (delError) return { error: delError.message }

  if (athleteIds.length > 0) {
    const { error } = await supabase.from('lineup_members').insert(
      // event_id lo riempie il trigger: qui si passa un segnaposto perche'
      // la colonna e' not null e PostgREST manda comunque tutte le chiavi.
      athleteIds.map((athlete_id) => ({
        lineup_id: lineupId,
        athlete_id,
        event_id: eventId,
      }))
    )

    if (error) return { error: error.message }
  }

  refresh(eventId)
  return { ok: true }
}

/**
 * Il + e il - a fianco dell'atleta. Si scrive il totale voluto, non un
 * delta: due allenatori che toccano lo stesso contatore non si sommano
 * a vicenda, l'ultimo che salva ha ragione.
 */
export async function setScore(
  lineupId: string,
  athleteId: string,
  kind: ScoreKind,
  qty: number
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  if (!SCORE_KINDS.includes(kind)) return { error: 'Tipo di marcatura sconosciuto.' }
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) {
    return { error: 'Numero di marcature non valido.' }
  }

  const supabase = await createClient()

  // A zero si cancella: la tabella resta l'elenco di chi ha segnato.
  const { error } =
    qty === 0
      ? await supabase
          .from('scores')
          .delete()
          .match({ lineup_id: lineupId, athlete_id: athleteId, kind })
      : await supabase.from('scores').upsert(
          { lineup_id: lineupId, athlete_id: athleteId, kind, qty },
          { onConflict: 'lineup_id,athlete_id,kind' }
        )

  if (error) return { error: error.message }

  const { data: lineup } = await supabase
    .from('lineups')
    .select('event_id')
    .eq('id', lineupId)
    .maybeSingle()

  if (lineup) refresh((lineup as { event_id: string }).event_id)
  return { ok: true }
}

/**
 * Segna in blocco chi, nella squadra della partita, e' rimasto fuori da
 * tutte le formazioni: assenti normali, oppure non convocati e quindi
 * fuori dalle percentuali. Non tocca chi ha gia' una posizione sul
 * tabellone: le correzioni fatte a mano restano.
 */
export async function markTheRest(
  eventId: string,
  notCalled: boolean
): Promise<ActionResult & { count?: number }> {
  const denied = await guard('appello')
  if (denied) return denied

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mark_uncalled', {
    p_event_id: eventId,
    p_not_called: notCalled,
  })

  if (error) return { error: error.message }

  refresh(eventId)
  return { ok: true, count: Number(data ?? 0) }
}
