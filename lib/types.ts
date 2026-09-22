/**
 * Quello che una server action restituisce al form: o e' andata, o c'e'
 * un messaggio da mostrare. Sta qui e non nei file 'use server', che
 * possono esportare solo funzioni asincrone.
 */
export type ActionResult = { ok?: true; error?: string }

export type EventType = 'training' | 'match'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  /**
   * Il tipo base, tenuto allineato dal database al ruolo assegnato:
   * athlete = il giocatore che entra per segnare solo se stesso.
   * Per l'interfaccia conta role_id; questa colonna la legge la RLS.
   */
  role: 'user' | 'admin' | 'athlete'
  /** Il ruolo vero e proprio, con la sua matrice di permessi. */
  role_id: string | null
  status: 'pending' | 'active' | 'blocked'
  created_at: string
}

/**
 * Un ruolo: un nome, un tipo base che decide cosa la RLS gli concede,
 * e una matrice di permessi (tabella role_permissions).
 */
export type RoleBase = 'admin' | 'staff' | 'athlete'

export type Role = {
  id: string
  key: string
  name: string
  base: RoleBase
  /** I tre ruoli di partenza: si rinominano, non si eliminano. */
  is_system: boolean
  /** Quello che prende chi si registra da solo. */
  is_default: boolean
  sort: number
  created_at: string
}

export type RolePermission = {
  role_id: string
  section: string
  level: 'none' | 'view' | 'edit'
}

export const ROLE_BASE_LABEL: Record<RoleBase, string> = {
  admin: 'Amministratore',
  staff: 'Staff',
  athlete: 'Giocatore',
}

export const ROLE_BASE_HINT: Record<RoleBase, string> = {
  admin: 'Accesso completo, sempre. Ignora la matrice dei permessi.',
  staff: 'Opera su tutta la rosa: compila l’appello di chiunque e vede le percentuali di tutti.',
  athlete: 'Collegato a una scheda atleta: vede e segna solo se stesso, nelle sue squadre.',
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
  /** Solo per le partite: avversario e ora di ritrovo. */
  opponent: string | null
  meet_at: string | null
  /** location e' il nome del campo, address la via da dare a Maps. */
  address: string | null
}

export type Absence = {
  event_id: string
  athlete_id: string
  injury: boolean
  /**
   * Assenza che non conta: il giocatore non era convocato. L'evento esce
   * dalle sue percentuali — ne' presenza ne' assenza. Lo mette solo lo
   * staff, e non sta insieme a injury (vincolo nel database).
   */
  not_called: boolean
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

/* ── partite: formazioni, risultato, marcature ────────────────────── */

/** I quattro modi di segnare nel rugby, coi punti che valgono. */
export type ScoreKind = 'try' | 'conversion' | 'penalty' | 'drop'

export const SCORE_KINDS: ScoreKind[] = ['try', 'conversion', 'penalty', 'drop']

/** Speculare a score_points() nel database: se cambia uno, cambia l'altro. */
export const SCORE_POINTS: Record<ScoreKind, number> = {
  try: 5,
  conversion: 2,
  penalty: 3,
  drop: 3,
}

export const SCORE_LABEL: Record<ScoreKind, string> = {
  try: 'Mete',
  conversion: 'Trasformazioni',
  penalty: 'Calci piazzati',
  drop: 'Drop',
}

/** Versione corta, per i pulsanti stretti del telefono. */
export const SCORE_SHORT: Record<ScoreKind, string> = {
  try: 'Mete',
  conversion: 'Trasf.',
  penalty: 'Piazzati',
  drop: 'Drop',
}

export const SCORE_ONE: Record<ScoreKind, string> = {
  try: 'meta',
  conversion: 'trasformazione',
  penalty: 'piazzato',
  drop: 'drop',
}

/**
 * Una formazione della partita: al concentramento se ne porta piu' d'una
 * sullo stesso campo. Orario e avversario nulli si ereditano dall'evento.
 */
export type Lineup = {
  id: string
  event_id: string
  name: string
  starts_at: string | null
  meet_at: string | null
  opponent: string | null
  points_for: number | null
  points_against: number | null
  sort: number
  created_at: string
}

export type LineupMember = {
  lineup_id: string
  athlete_id: string
  event_id: string
}

/** Contatore, non registro: una riga per atleta e tipo, qty che sale e scende. */
export type Score = {
  lineup_id: string
  athlete_id: string
  kind: ScoreKind
  qty: number
}

export type MatchOutcome = 'win' | 'loss' | 'draw'

/** Una riga della vista match_results: una formazione gia' giocata. */
export type MatchResult = {
  lineup_id: string
  event_id: string
  lineup_name: string
  team_id: string | null
  starts_at: string
  opponent: string | null
  location: string | null
  points_for: number | null
  points_against: number | null
  outcome: MatchOutcome | null
  called: number
  scored_points: number
}

/** Una riga della vista scorer_stats: le marcature di un atleta. */
export type ScorerStat = {
  athlete_id: string
  team_id: string | null
  tries: number | null
  conversions: number | null
  penalties: number | null
  drops: number | null
  points: number | null
  matches_scored: number
}

/** Somma i punti di un insieme di marcature. */
export function scorePoints(scores: { kind: ScoreKind; qty: number }[]) {
  return scores.reduce((n, s) => n + s.qty * SCORE_POINTS[s.kind], 0)
}

/* ── giorni previsti ──────────────────────────────────────────────── */

/**
 * L'accordo preso con un atleta: in quali giorni della settimana e'
 * atteso agli allenamenti, e da quando a quando vale. Gli allenamenti
 * negli altri giorni non entrano nelle sue percentuali. Senza nessuna
 * regola, come per quasi tutti, conta tutto.
 */
export type AthleteSchedule = {
  id: string
  athlete_id: string
  /** Standard ISO: 1 = lunedi ... 7 = domenica. */
  weekdays: number[]
  from_date: string | null
  to_date: string | null
  note: string | null
  created_at: string
}

export const WEEKDAYS: [number, string, string][] = [
  [1, 'Lunedì', 'lun'],
  [2, 'Martedì', 'mar'],
  [3, 'Mercoledì', 'mer'],
  [4, 'Giovedì', 'gio'],
  [5, 'Venerdì', 'ven'],
  [6, 'Sabato', 'sab'],
  [7, 'Domenica', 'dom'],
]

export const WEEKDAY_SHORT: Record<number, string> = Object.fromEntries(
  WEEKDAYS.map(([n, , short]) => [n, short])
)

/** Una riga della vista event_attendance: quanti erano attesi e quanti c'erano. */
export type EventAttendance = {
  event_id: string
  type: EventType
  starts_at: string
  team_id: string | null
  title: string | null
  opponent: string | null
  expected: number
  present: number
  injured: number
  uncalled: number
}
