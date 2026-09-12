'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Coda delle modifiche all'appello fatte senza rete.
 *
 * Ogni voce e' l'INTENZIONE finale per una coppia evento+atleta, non una
 * cronologia di tocchi: se a bordo campo segni assente, poi presente, poi
 * di nuovo assente, in coda resta una sola voce. Questo rende la
 * sincronizzazione idempotente e senza conflitti da risolvere: l'ultimo
 * stato vince, che e' esattamente cio' che l'allenatore si aspetta.
 */

export type QueueEntry = {
  event_id: string
  athlete_id: string
  absent: boolean
  injury: boolean
  marked_by: string
  at: number
}

const KEY = 'presenze-queue'
export const QUEUE_EVENT = 'presenze-queue-change'

function read(): Record<string, QueueEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function write(data: Record<string, QueueEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Spazio esaurito o navigazione privata: si perde la coda, non i dati
    // gia' salvati sul server.
  }
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT))
}

function keyOf(eventId: string, athleteId: string) {
  return `${eventId}:${athleteId}`
}

export function enqueue(entry: Omit<QueueEntry, 'at'>) {
  const data = read()
  data[keyOf(entry.event_id, entry.athlete_id)] = { ...entry, at: Date.now() }
  write(data)
}

export function pendingCount() {
  return Object.keys(read()).length
}

/** Voci in attesa per un evento, per riallineare la schermata al ricarico. */
export function pendingFor(eventId: string) {
  return Object.values(read()).filter((e) => e.event_id === eventId)
}

function drop(eventId: string, athleteId: string) {
  const data = read()
  delete data[keyOf(eventId, athleteId)]
  write(data)
}

let running = false

/** Riversa la coda sul server. Si ferma al primo errore di rete. */
export async function flush(supabase: SupabaseClient) {
  if (running) return { sent: 0, left: pendingCount() }
  running = true

  let sent = 0

  try {
    for (const entry of Object.values(read())) {
      const { error } = entry.absent
        ? await supabase.from('absences').upsert(
            {
              event_id: entry.event_id,
              athlete_id: entry.athlete_id,
              injury: entry.injury,
              marked_by: entry.marked_by,
            },
            { onConflict: 'event_id,athlete_id' }
          )
        : await supabase
            .from('absences')
            .delete()
            .match({ event_id: entry.event_id, athlete_id: entry.athlete_id })

      if (error) {
        // Ancora offline: si riprova al prossimo giro.
        if (!navigator.onLine) break
        // Errore vero e proprio (riga gia' rimossa, permessi): la voce
        // viene scartata, altrimenti blocca la coda per sempre.
        drop(entry.event_id, entry.athlete_id)
        continue
      }

      drop(entry.event_id, entry.athlete_id)
      sent++
    }
  } finally {
    running = false
  }

  return { sent, left: pendingCount() }
}
