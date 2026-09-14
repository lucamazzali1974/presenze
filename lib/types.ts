export type EventType = 'training' | 'match'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  /** athlete = il giocatore che entra per segnare solo se stesso. */
  role: 'user' | 'admin' | 'athlete'
  status: 'pending' | 'active' | 'blocked'
  created_at: string
}

export type Team = {
  id: string
  name: string
  active: boolean
}

/** Un atleta puo' stare in piu' squadre: l'appartenenza e' una tabella ponte. */
export type TeamMember = {
  team_id: string
  athlete_id: string
}

export type Athlete = {
  id: string
  first_name: string
  last_name: string
  nickname: string | null
  active: boolean
  joined_on: string
  /** Account collegato, se il giocatore accede da solo. */
  profile_id: string | null
}

export type Event = {
  id: string
  type: EventType
  starts_at: string
  title: string | null
  location: string | null
  series_id: string | null
  closed_at: string | null
  archive_id: string | null
  /** null = evento di tutta la societa', vale per chiunque. */
  team_id: string | null
}

export type Absence = {
  event_id: string
  athlete_id: string
  injury: boolean
}

export type AttendanceStat = {
  athlete_id: string
  first_name: string
  last_name: string
  nickname: string | null
  type: EventType
  expected: number
  attended: number
  pct: number
  injuries: number
}

/**
 * La vista attendance_stats spezza per squadra. Il totale su piu' squadre
 * lo somma l'app: vedi sumStats in lib/stats.ts.
 * Gli snapshot degli archivi restano nella forma aggregata (senza team_id).
 */
export type AttendanceStatRow = AttendanceStat & { team_id: string | null }

export type Archive = {
  id: string
  name: string | null
  from_date: string
  to_date: string
  snapshot: AttendanceStat[]
  events_count: number
  created_at: string
}
