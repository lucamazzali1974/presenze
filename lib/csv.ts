import type { AttendanceStat, Event } from '@/lib/types'
import { EVENT_LABEL, formatShort } from '@/lib/format'

/**
 * CSV con separatore ";" e BOM: e' il formato che Excel italiano apre
 * con un doppio clic, senza passare dalla procedura di importazione.
 */
function toCsv(rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '\uFEFF' + rows.map((r) => r.map(escape).join(';')).join('\r\n')
}

export function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function slugDate(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

type StatRow = {
  name: string
  nickname: string
  training: AttendanceStat | null
  match: AttendanceStat | null
}

export function statsCsv(rows: StatRow[]) {
  const head = [
    'Soprannome',
    'Nome e cognome',
    'Allenamenti previsti',
    'Allenamenti presenti',
    '% allenamenti',
    'Infortuni allenamenti',
    'Partite previste',
    'Partite presenti',
    '% partite',
    'Infortuni partite',
  ]

  const body = rows.map((r) => [
    r.nickname,
    r.name,
    r.training?.expected ?? 0,
    r.training?.attended ?? 0,
    r.training ? String(r.training.pct).replace('.', ',') : '',
    r.training?.injuries ?? 0,
    r.match?.expected ?? 0,
    r.match?.attended ?? 0,
    r.match ? String(r.match.pct).replace('.', ',') : '',
    r.match?.injuries ?? 0,
  ])

  return toCsv([head, ...body])
}

export function eventsCsv(events: Event[]) {
  const head = ['Data e ora', 'Tipo', 'Titolo', 'Luogo', 'Appello', 'Ricorrente']

  const body = events.map((e) => [
    formatShort(e.starts_at),
    EVENT_LABEL[e.type],
    e.title ?? '',
    e.location ?? '',
    e.closed_at ? 'chiuso' : 'aperto',
    e.series_id ? 'si' : 'no',
  ])

  return toCsv([head, ...body])
}
