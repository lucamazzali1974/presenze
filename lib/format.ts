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
