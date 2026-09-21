/*
 * Permessi per sezione.
 *
 * Ogni ruolo ha, per ciascuna sezione dell'app, uno di tre livelli:
 *   none = la sezione non esiste (niente voce di menu, pagina negata)
 *   view = si guarda e basta
 *   edit = si modifica
 *
 * Questo file e' solo la faccia dell'app: la verita' sta nel database
 * (role_permissions + can_view/can_edit nelle policy RLS). Qui si decide
 * cosa mostrare, non cosa e' permesso.
 */

export const SECTIONS = [
  'appello',
  'calendario',
  'atleti',
  'percentuali',
  'archivio',
  'squadre',
  'utenti',
  'ruoli',
] as const

export type Section = (typeof SECTIONS)[number]
export type Level = 'none' | 'view' | 'edit'
export type Perms = Record<Section, Level>

export const LEVELS: Level[] = ['none', 'view', 'edit']

export const LEVEL_LABEL: Record<Level, string> = {
  none: 'Nascosta',
  view: 'Sola lettura',
  edit: 'Modifica',
}

type SectionMeta = {
  label: string
  /** Dove porta la voce di menu quando il livello e' view. */
  href: string
  /** Dove porta quando il livello e' edit, se esiste una pagina di gestione. */
  editHref?: string
  /** Cosa vuol dire "modifica" per questa sezione: si legge nella matrice. */
  view: string
  edit: string
}

export const SECTION_META: Record<Section, SectionMeta> = {
  appello: {
    label: 'Appello',
    href: '/',
    view: 'Vede il tabellone dei presenti',
    edit: 'Segna presenze e chiude l’appello',
  },
  calendario: {
    label: 'Calendario',
    href: '/calendario',
    editHref: '/admin/events',
    view: 'Vede allenamenti e partite in programma',
    edit: 'Crea, modifica ed elimina le date',
  },
  atleti: {
    label: 'Atleti',
    href: '/atleti',
    view: 'Vede la rosa',
    edit: 'Gestisce l’anagrafica dei giocatori',
  },
  percentuali: {
    label: 'Percentuali',
    href: '/stats',
    view: 'Vede le statistiche di presenza',
    edit: 'Vede le statistiche ed esporta il CSV',
  },
  archivio: {
    label: 'Archivio',
    href: '/archivio',
    view: 'Consulta i periodi archiviati',
    edit: 'Archivia, ripristina ed elimina i periodi',
  },
  squadre: {
    label: 'Squadre',
    href: '/admin/teams',
    view: 'Vede squadre e composizione',
    edit: 'Crea squadre e ne cambia la rosa',
  },
  utenti: {
    label: 'Utenti',
    href: '/admin/users',
    view: 'Vede gli account registrati',
    edit: 'Attiva, blocca e assegna i ruoli',
  },
  ruoli: {
    label: 'Ruoli',
    href: '/admin/roles',
    view: 'Vede ruoli e permessi',
    edit: 'Crea i ruoli e ne cambia i permessi',
  },
}

export const NO_PERMS: Perms = SECTIONS.reduce((acc, s) => {
  acc[s] = 'none'
  return acc
}, {} as Perms)

export const FULL_PERMS: Perms = SECTIONS.reduce((acc, s) => {
  acc[s] = 'edit'
  return acc
}, {} as Perms)

function isLevel(value: unknown): value is Level {
  return value === 'none' || value === 'view' || value === 'edit'
}

/** Normalizza quello che arriva da my_permissions(): sezioni mancanti = none. */
export function readPerms(raw: unknown): Perms {
  const source = (raw ?? {}) as Record<string, unknown>
  const out = { ...NO_PERMS }

  for (const section of SECTIONS) {
    const value = source[section]
    if (isLevel(value)) out[section] = value
  }

  return out
}

export function canView(perms: Perms, section: Section) {
  return perms[section] !== 'none'
}

export function canEdit(perms: Perms, section: Section) {
  return perms[section] === 'edit'
}

/** Il link giusto per la voce di menu: la pagina di gestione se puo' modificare. */
export function hrefFor(perms: Perms, section: Section) {
  const meta = SECTION_META[section]
  return canEdit(perms, section) && meta.editHref ? meta.editHref : meta.href
}

/**
 * Dove mandare chi apre una pagina che non gli spetta. Il profilo non ha
 * permessi associati: e' la pagina di ripiego, sempre raggiungibile.
 */
export function landingFor(perms: Perms) {
  const first = SECTIONS.find((s) => canView(perms, s))
  return first ? hrefFor(perms, first) : '/profilo'
}

/** Le voci di menu, nell'ordine in cui compaiono. */
export function navSections(perms: Perms): Section[] {
  return SECTIONS.filter((s) => canView(perms, s))
}
