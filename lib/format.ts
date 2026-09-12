const TZ = 'Europe/Rome'

export function formatEventDate(iso: string) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  }).format(new Date(iso))
}

export function formatEventTime(iso: string) {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso))
}

export function formatShort(iso: string) {
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso))
}

/**
 * Formatta una data "pura" (YYYY-MM-DD, come joined_on) senza passare da UTC:
 * new Date('2026-09-12') sarebbe mezzanotte UTC e su certi fusi tornerebbe
 * indietro di un giorno.
 */
export function formatDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}

/** La data di oggi in formato YYYY-MM-DD, per i default degli <input type="date">. */
export function todayInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function displayName(a: {
  first_name: string
  last_name: string
  nickname: string | null
}) {
  return a.nickname?.trim() ? a.nickname : `${a.first_name} ${a.last_name}`
}

export function fullName(a: { first_name: string; last_name: string }) {
  return `${a.last_name} ${a.first_name}`
}

export const EVENT_LABEL: Record<string, string> = {
  training: 'Allenamento',
  match: 'Partita',
}

/** Scompone un timestamp nei valori da mettere in <input type="date"|"time">. */
export function toLocalInputs(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).formatToParts(new Date(iso))

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
  }
}

/**
 * Offset di Europe/Rome (in millisecondi) all'istante UTC indicato.
 * Serve a convertire un orario "da calendario" nel timestamp giusto
 * tenendo conto dell'ora legale.
 */
function zoneOffsetMs(utcMs: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const hour = get('hour') === 24 ? 0 : get('hour')

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second')
  )

  return asUtc - utcMs
}

/**
 * Inverso di toLocalInputs: da data + ora dei campi del form al timestamp
 * ISO con la zona esplicita.
 *
 * ATTENZIONE: mandare a Postgres la stringa nuda "2026-09-15T19:00:00" NON
 * funziona. La colonna e' timestamptz e Postgres interpreta un timestamp
 * senza zona con il fuso della sessione, che su Supabase e' UTC: l'evento
 * finirebbe alle 21:00 italiane invece che alle 19:00.
 */
export function localToISO(date: string, time: string) {
  const hhmm = time.slice(0, 5)
  const naive = Date.parse(`${date}T${hhmm}:00Z`)
  if (Number.isNaN(naive)) return `${date}T${hhmm}:00Z`

  // Due passaggi: il primo stima l'offset, il secondo lo ricalcola
  // sull'istante corretto (conta nei giorni di cambio dell'ora).
  let utc = naive - zoneOffsetMs(naive)
  utc = naive - zoneOffsetMs(utc)

  return new Date(utc).toISOString()
}

/** Etichetta di raggruppamento: "settembre 2026". */
export function monthLabel(iso: string) {
  return new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(new Date(iso))
}

/** Giorno e mese compatti per il calendario: "mar 15 set". */
export function dayStamp(iso: string) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  }).format(new Date(iso))
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now()
}
