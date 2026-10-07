'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { guard } from '@/lib/auth'
import { localToISO, toLocalInputs } from '@/lib/format'
import { SCORE_KINDS, type ActionResult, type Lineup, type ScoreKind } from '@/lib/types'

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`)
  revalidatePath('/')
  revalidatePath('/stats')
  revalidatePath('/calendario')
}

/**
 * Orario di formazione o incontro. Arriva come sola ora ("11:30"): la
 * data e' quella della partita, passata dal form, perche' non si gioca
 * in un altro giorno.
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

function readText(formData: FormData, field: string) {
  return String(formData.get(field) ?? '').trim() || null
}

async function eventOfLineup(lineupId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lineups')
    .select('event_id')
    .eq('id', lineupId)
    .maybeSingle()
  return (data as { event_id: string } | null)?.event_id ?? null
}

/* ── formazioni ───────────────────────────────────────────────────── */

/**
 * Nuova formazione, gia' con il suo primo incontro: una formazione
 * senza incontri non avrebbe dove segnare risultato e marcature.
 * Avversario e orario del form vanno sull'incontro.
 */
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
      meet_at: readTime(formData, 'meet_time', date),
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

  const lineupId = (data[0] as { id: string }).id

  const { error: gameError } = await supabase.from('games').insert({
    lineup_id: lineupId,
    // Segnaposto: lo riscrive il trigger dalla formazione.
    event_id: eventId,
    opponent: readText(formData, 'opponent'),
    starts_at: readTime(formData, 'time', date),
    sort: 10,
  })

  if (gameError) return { error: gameError.message }

  refresh(eventId)
  return { ok: true }
}

/** Nome e ritrovo: il resto (avversario, orario, risultato) e' dell'incontro. */
export async function updateLineup(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Dai un nome alla formazione.' }

  const date = String(formData.get('date') ?? '')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lineups')
    .update({ name, meet_at: readTime(formData, 'meet_time', date) })
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

  const eventId = await eventOfLineup(id)
  const supabase = await createClient()

  const { error } = await supabase.from('lineups').delete().eq('id', id)
  if (error) return { error: error.message }

  if (eventId) refresh(eventId)
  return { ok: true }
}

/**
 * Riscrive i convocati di una formazione. Chi entra qui esce dalle altre
 * formazioni della stessa partita: un atleta gioca in una squadra sola, e
 * il vincolo unique in database farebbe altrimenti fallire il salvataggio
 * con un errore che non dice niente. Negli incontri della formazione
 * (triangolare) i convocati sono sempre gli stessi.
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

/* ── impostazione rapida ──────────────────────────────────────────── */

export type GameDraft = { opponent?: string | null; time?: string | null }

/**
 * Prepara la partita in un colpo: una formazione col nome della squadra,
 * tutta la rosa convocata, e uno o piu' incontri.
 *
 *   partita singola -> un incontro, avversario e orario della partita
 *   piu' incontri   -> un incontro per riga (triangolare, concentramento)
 *
 * La rosa intera e' il punto di partenza piu' comodo: si toglie chi non
 * gioca, invece di spuntare uno per uno chi gioca.
 */
export async function setupMatch(
  eventId: string,
  games: GameDraft[]
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const supabase = await createClient()

  const { data: ev } = await supabase
    .from('events')
    .select('id, type, team_id, starts_at')
    .eq('id', eventId)
    .maybeSingle()

  const event = ev as
    | { id: string; type: string; team_id: string | null; starts_at: string }
    | null

  if (!event || event.type !== 'match') return { error: 'Partita non trovata.' }

  const { count } = await supabase
    .from('lineups')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)

  if ((count ?? 0) > 0) {
    return { error: 'La partita ha già delle formazioni: aggiungi gli incontri da lì.' }
  }

  // Il nome: quello della squadra, o un generico se la partita e' di tutti.
  let name = 'Squadra'
  let roster: string[] = []

  if (event.team_id) {
    const [{ data: team }, { data: members }] = await Promise.all([
      supabase.from('teams').select('name').eq('id', event.team_id).maybeSingle(),
      supabase.from('team_members').select('athlete_id').eq('team_id', event.team_id),
    ])
    name = (team as { name: string } | null)?.name ?? name
    roster = ((members ?? []) as { athlete_id: string }[]).map((m) => m.athlete_id)
  }

  const { data: active } = await supabase
    .from('athletes')
    .select('id')
    .eq('active', true)

  const activeIds = new Set(((active ?? []) as { id: string }[]).map((a) => a.id))
  roster = event.team_id ? roster.filter((id) => activeIds.has(id)) : [...activeIds]

  const { data: created, error } = await supabase
    .from('lineups')
    .insert({ event_id: eventId, name, sort: 10 })
    .select('id')

  if (error) return { error: error.message }
  if (!created || created.length === 0) {
    return { error: 'Formazione non creata: permessi insufficienti.' }
  }

  const lineupId = (created[0] as { id: string }).id
  const date = toLocalInputs(event.starts_at).date
  const drafts = games.length > 0 ? games : [{}]

  const { error: gamesError } = await supabase.from('games').insert(
    drafts.map((g, i) => ({
      lineup_id: lineupId,
      event_id: eventId,
      opponent: g.opponent?.trim() || null,
      starts_at: g.time?.trim() ? localToISO(date, g.time.trim()) : null,
      sort: (i + 1) * 10,
    }))
  )

  if (gamesError) return { error: gamesError.message }

  if (roster.length > 0) {
    const { error: membersError } = await supabase.from('lineup_members').insert(
      roster.map((athlete_id) => ({ lineup_id: lineupId, athlete_id, event_id: eventId }))
    )
    if (membersError) return { error: membersError.message }
  }

  refresh(eventId)
  return { ok: true }
}

/* ── incontri ─────────────────────────────────────────────────────── */

/** Un incontro in piu' per la formazione: il secondo del triangolare. */
export async function createGame(
  lineupId: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const eventId = await eventOfLineup(lineupId)
  if (!eventId) return { error: 'Formazione non trovata.' }

  const date = String(formData.get('date') ?? '')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('games')
    .insert({
      lineup_id: lineupId,
      event_id: eventId,
      opponent: readText(formData, 'opponent'),
      starts_at: readTime(formData, 'time', date),
      sort: Number(formData.get('sort') ?? 100) || 100,
    })
    .select('id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Incontro non creato: permessi insufficienti.' }
  }

  refresh(eventId)
  return { ok: true }
}

/** Avversario, orario e risultato dell'incontro. */
export async function updateGame(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

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
    .from('games')
    .update({
      opponent: readText(formData, 'opponent'),
      starts_at: readTime(formData, 'time', date),
      points_for: pf,
      points_against: pa,
    })
    .eq('id', id)
    .select('event_id')

  if (error) return { error: error.message }
  if (!data || data.length === 0) {
    return { error: 'Nessuna modifica salvata: permessi insufficienti.' }
  }

  refresh((data[0] as { event_id: string }).event_id)
  return { ok: true }
}

/**
 * Toglie un incontro con le sue marcature. L'ultimo resta: per togliere
 * anche quello si elimina la formazione.
 */
export async function deleteGame(id: string): Promise<ActionResult> {
  const denied = await guard('appello')
  if (denied) return denied

  const supabase = await createClient()

  const { data: game } = await supabase
    .from('games')
    .select('lineup_id, event_id')
    .eq('id', id)
    .maybeSingle()

  if (!game) return { error: 'Incontro non trovato.' }
  const { lineup_id, event_id } = game as { lineup_id: string; event_id: string }

  const { count } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('lineup_id', lineup_id)

  if ((count ?? 0) <= 1) {
    return {
      error: 'È l’unico incontro della formazione: per toglierlo elimina la formazione.',
    }
  }

  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) return { error: error.message }

  refresh(event_id)
  return { ok: true }
}

/* ── marcature ────────────────────────────────────────────────────── */

/**
 * Il + e il - a fianco dell'atleta. Si scrive il totale voluto, non un
 * delta: due allenatori che toccano lo stesso contatore non si sommano
 * a vicenda, l'ultimo che salva ha ragione.
 */
export async function setScore(
  gameId: string,
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

  const { data: game } = await supabase
    .from('games')
    .select('lineup_id, event_id')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return { error: 'Incontro non trovato.' }
  const { lineup_id, event_id } = game as { lineup_id: string; event_id: string }

  // A zero si cancella: la tabella resta l'elenco di chi ha segnato.
  const { error } =
    qty === 0
      ? await supabase
          .from('scores')
          .delete()
          .match({ game_id: gameId, athlete_id: athleteId, kind })
      : await supabase.from('scores').upsert(
          // lineup_id lo riscrive il trigger dall'incontro.
          { game_id: gameId, lineup_id, athlete_id: athleteId, kind, qty },
          { onConflict: 'game_id,athlete_id,kind' }
        )

  if (error) return { error: error.message }

  refresh(event_id)
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
