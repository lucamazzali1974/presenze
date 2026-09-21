import Link from 'next/link'
import { Nav } from '@/components/nav'
import { isStaff, myAthlete, requireSection } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { EVENT_LABEL, dayStamp, formatEventTime, monthLabel } from '@/lib/format'
import { mapsUrl } from '@/lib/maps'
import type { Event, Lineup, LineupMember, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Calendario in sola lettura, per chi non ha accesso a /admin/events:
 * giocatori e allenatori vedono cosa c'e' in programma e da qui aprono
 * l'appello. Le modifiche al calendario restano agli admin.
 */
export default async function CalendarioPage() {
  const { profile, perms } = await requireSection('calendario')
  const supabase = await createClient()

  const me = await myAthlete(profile)
  const staff = isStaff(profile)

  // 4 ore di tolleranza, come in home: l'appello si compila anche a
  // evento iniziato.
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const [{ data: eventsData }, { data: teamsData }, { data: membersData }] =
    await Promise.all([
      supabase
        .from('events')
        .select('*')
        .is('archive_id', null)
        .gte('starts_at', since)
        .order('starts_at', { ascending: true })
        .limit(200),
      supabase.from('teams').select('*'),
      supabase.from('team_members').select('*'),
    ])

  const teams = (teamsData ?? []) as Team[]
  const members = (membersData ?? []) as { team_id: string; athlete_id: string }[]
  const teamName = new Map(teams.map((t) => [t.id, t.name]))

  // Al giocatore interessano solo gli eventi che lo riguardano: quelli
  // senza squadra, piu' quelli delle squadre di cui fa parte.
  const myTeams = new Set(
    me ? members.filter((m) => m.athlete_id === me.id).map((m) => m.team_id) : []
  )

  const events = ((eventsData ?? []) as Event[]).filter(
    (e) => staff || !me || e.team_id === null || myTeams.has(e.team_id)
  )

  /*
   * Le formazioni delle partite in programma. Al concentramento ogni
   * squadra ha il suo orario: al giocatore si mostra quello della sua,
   * non quello generico della giornata.
   */
  const matchIds = events.filter((e) => e.type === 'match').map((e) => e.id)

  const [{ data: lineupsData }, { data: lineupMembersData }] =
    matchIds.length > 0
      ? await Promise.all([
          supabase.from('lineups').select('*').in('event_id', matchIds).order('sort'),
          supabase.from('lineup_members').select('*').in('event_id', matchIds),
        ])
      : [{ data: null }, { data: null }]

  const lineups = (lineupsData ?? []) as Lineup[]
  const lineupMembers = (lineupMembersData ?? []) as LineupMember[]

  // La formazione del giocatore, partita per partita.
  const myLineup = new Map<string, string>()
  if (me) {
    for (const m of lineupMembers) {
      if (m.athlete_id === me.id) myLineup.set(m.event_id, m.lineup_id)
    }
  }

  function lineupsOf(eventId: string) {
    const all = lineups.filter((l) => l.event_id === eventId)
    if (!me || staff) return all

    // Il giocatore vede la propria; se non e' convocato, nessuna.
    const mine = myLineup.get(eventId)
    return mine ? all.filter((l) => l.id === mine) : []
  }

  // Dove il giocatore si e' gia' segnato assente.
  const { data: absencesData } = me
    ? await supabase
        .from('absences')
        .select('event_id, injury, not_called')
        .eq('athlete_id', me.id)
    : { data: null }

  const absences = new Map(
    (
      (absencesData ?? []) as {
        event_id: string
        injury: boolean
        not_called: boolean
      }[]
    ).map((a) => [a.event_id, a])
  )

  const groups: { label: string; events: Event[] }[] = []
  for (const e of events) {
    const label = monthLabel(e.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.events.push(e)
    else groups.push({ label, events: [e] })
  }

  return (
    <>
      <Nav perms={perms} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Calendario</p>
          <h1 className="h1">In programma</h1>
          <p className="sub">
            {events.length === 0
              ? 'Niente in programma al momento.'
              : staff
                ? `${events.length} tra allenamenti e partite.`
                : 'Apri un evento per segnalare che non ci sarai.'}
          </p>
        </div>

        {groups.map((group) => (
          <section key={group.label} className="mb-4">
            <p className="mini mb-2">{group.label}</p>

            <ul className="panel rows">
              {group.events.map((e) => {
                const mark = absences.get(e.id)
                const isMatch = e.type === 'match'

                return (
                  <li key={e.id} className="row" data-kind={e.type}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        style={{
                          color: 'var(--color-text)',
                          fontWeight: 500,
                          fontSize: isMatch ? '1.0625rem' : undefined,
                        }}
                      >
                        {isMatch
                          ? e.opponent
                            ? `vs ${e.opponent}`
                            : e.title || 'Partita'
                          : e.title || EVENT_LABEL[e.type]}
                      </span>

                      <span className="flex flex-wrap gap-2">
                        <span className={isMatch ? 'tag info' : 'tag'}>
                          {EVENT_LABEL[e.type]}
                        </span>
                        {e.team_id && (
                          <span className="tag">
                            {teamName.get(e.team_id) ?? 'Squadra rimossa'}
                          </span>
                        )}
                        {me && (
                          <span
                            className={
                              !mark
                                ? 'tag pass'
                                : mark.not_called
                                  ? 'tag'
                                  : 'tag fail'
                            }
                          >
                            {!mark
                              ? 'Presente'
                              : mark.not_called
                                ? 'Non convocato'
                                : mark.injury
                                  ? 'Assente · infortunio'
                                  : 'Assente'}
                          </span>
                        )}
                        {e.closed_at && <span className="tag">Appello chiuso</span>}
                      </span>
                    </div>

                    {isMatch && lineupsOf(e.id).length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-2">
                        {lineupsOf(e.id).map((l) => (
                          <span key={l.id} className="tag info">
                            {l.name} · {formatEventTime(l.starts_at ?? e.starts_at)}
                            {l.meet_at && ` · ritrovo ${formatEventTime(l.meet_at)}`}
                          </span>
                        ))}
                      </p>
                    )}

                    {isMatch ? (
                      /* Per una partita i dati sono tanti e contano tutti:
                         meglio una scheda che una riga di testo con i punti. */
                      <dl className="facts">
                        <div>
                          <dt>Data</dt>
                          <dd className="strong">{dayStamp(e.starts_at)}</dd>
                        </div>
                        {e.meet_at && (
                          <div>
                            <dt>Ritrovo</dt>
                            <dd className="strong">{formatEventTime(e.meet_at)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Inizio</dt>
                          <dd className="strong">{formatEventTime(e.starts_at)}</dd>
                        </div>
                        {e.opponent && (
                          <div>
                            <dt>Avversario</dt>
                            <dd>{e.opponent}</dd>
                          </div>
                        )}
                        {(e.location || e.address) && (
                          <div>
                            <dt>Campo</dt>
                            <dd>
                              {e.location}
                              {e.address && (
                                <>
                                  {e.location && <br />}
                                  <span style={{ color: 'var(--color-muted)' }}>
                                    {e.address}
                                  </span>
                                </>
                              )}
                            </dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="mt-1.5 text-sm">
                        <span style={{ color: 'var(--color-par)' }}>
                          {dayStamp(e.starts_at)} · {formatEventTime(e.starts_at)}
                        </span>
                        {e.location && (
                          <span style={{ color: 'var(--color-muted)' }}>
                            {' '}
                            · {e.location}
                          </span>
                        )}
                      </p>
                    )}

                    <div className="row-actions">
                      <Link href={`/events/${e.id}`} className="btn btn-sm">
                        {me ? 'Segnala se non ci sarai' : 'Apri appello'}
                      </Link>

                      {isMatch && mapsUrl(e.address, e.location) && (
                        <a
                          className="btn btn-sm"
                          href={mapsUrl(e.address, e.location)!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Apri in Maps
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {events.length === 0 && (
          <div className="panel">
            <p className="empty">
              Nessuna data in programma. Quando l&rsquo;allenatore le inserisce,
              compaiono qui.
            </p>
          </div>
        )}
      </main>
    </>
  )
}
