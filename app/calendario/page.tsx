import Link from 'next/link'
import { Nav } from '@/components/nav'
import { isStaff, myAthlete, requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import { EVENT_LABEL, dayStamp, formatEventTime, monthLabel } from '@/lib/format'
import type { Event, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Calendario in sola lettura, per chi non ha accesso a /admin/events:
 * giocatori e allenatori vedono cosa c'e' in programma e da qui aprono
 * l'appello. Le modifiche al calendario restano agli admin.
 */
export default async function CalendarioPage() {
  const profile = await requireProfile()
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

  // Dove il giocatore si e' gia' segnato assente.
  const { data: absencesData } = me
    ? await supabase
        .from('absences')
        .select('event_id, injury')
        .eq('athlete_id', me.id)
    : { data: null }

  const absences = new Map(
    ((absencesData ?? []) as { event_id: string; injury: boolean }[]).map((a) => [
      a.event_id,
      a.injury,
    ])
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
      <Nav profile={profile} />

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
                const absent = absences.has(e.id)
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
                          <span className={absent ? 'tag fail' : 'tag pass'}>
                            {absent
                              ? absences.get(e.id)
                                ? 'Assente · infortunio'
                                : 'Assente'
                              : 'Presente'}
                          </span>
                        )}
                        {e.closed_at && <span className="tag">Appello chiuso</span>}
                      </span>
                    </div>

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
                        {e.location && (
                          <div>
                            <dt>Campo</dt>
                            <dd>{e.location}</dd>
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
