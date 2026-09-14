import type { AttendanceStat, AttendanceStatRow, EventType } from '@/lib/types'

/**
 * Somma le righe della vista (una per squadra) in un unico dato per
 * atleta e tipo. La percentuale si ricalcola sui totali, non si fa la
 * media delle percentuali: 1/1 e 0/9 non fanno il 50%.
 */
export function sumStats(rows: AttendanceStatRow[]): AttendanceStat | null {
  if (rows.length === 0) return null

  const expected = rows.reduce((n, r) => n + r.expected, 0)
  const attended = rows.reduce((n, r) => n + r.attended, 0)
  const injuries = rows.reduce((n, r) => n + r.injuries, 0)

  if (expected === 0) return null

  return {
    athlete_id: rows[0].athlete_id,
    first_name: rows[0].first_name,
    last_name: rows[0].last_name,
    nickname: rows[0].nickname,
    type: rows[0].type,
    expected,
    attended,
    injuries,
    pct: Math.round((1000 * attended) / expected) / 10,
  }
}

/**
 * Filtra le righe per la squadra scelta. Gli eventi senza squadra
 * (team_id null) riguardano tutti, quindi entrano sempre.
 */
export function forTeam(rows: AttendanceStatRow[], teamId: string | null) {
  if (!teamId) return rows
  return rows.filter((r) => r.team_id === teamId || r.team_id === null)
}

export function byType(rows: AttendanceStatRow[], type: EventType) {
  return rows.filter((r) => r.type === type)
}
