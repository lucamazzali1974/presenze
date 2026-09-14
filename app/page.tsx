import Link from 'next/link'
import { Nav } from '@/components/nav'
import { EventSwitch } from '@/components/event-switch'
import { isStaff, myAthlete, requireProfile } from '@/lib/auth'
import { createClient } from '@/utils/supabase/server'
import type { Athlete, Event, EventType, Team } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>
}) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const params = await searchParams

  // L'atleta compila solo se stesso; lo staff compila tutti.
  const me = await myAthlete(profile)
  const staff = isStaff(profile)

  const [{ data: athletesData }, { data: teamsData }, { data: membersData }] =
    await Promise.all([
      supabase
        .from('athletes')
        .select('*')
        .eq('active', true)
        .order('last_name', { ascending: true }),
      supabase
        .from('teams')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase.from('team_members').select('*'),
    ])

  const roster = (athletesData ?? []) as Athlete[]
  const teams = (teamsData ?? []) as Team[]
  const members = (membersData ?? []) as { team_id: string; athlete_id: string }[]

  // La squadra scelta filtra quale sia il "prossimo" evento, non chi e'
  // convocato: quello lo decide l'evento stesso.
  const team = teams.some((t) => t.id === params.team) ? params.team! : null

  /*
   * Il giocatore non sceglie: vede gli eventi delle sue squadre, piu'
   * quelli di tutta la societa'. Niente selettore, niente "tutte le
   * squadre" — non ha nient'altro da guardare.
   */
  const myTeamIds = me
    ? members.filter((m) => m.athlete_id === me.id).map((m) => m.team_id)
    : []

  const myTeams = teams.filter((t) => myTeamIds.includes(t.id))

  // 4 ore di tolleranza: l'appello si compila anche a evento iniziato.
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  async function nextEvent(type: EventType) {
    let query = supabase
      .from('events')
      .select('*')
      .eq('type', type)
      .is('archive_id', null)
      .gte('starts_at', since)

    // Gli eventi senza squadra riguardano tutti, quindi restano in lista.
    if (!staff && me) {
      query =
        myTeamIds.length > 0
          ? query.or(`team_id.is.null,team_id.in.(${myTeamIds.join(',')})`)
          : query.is('team_id', null)
    } else if (team) {
      query = query.or(`team_id.eq.${team},team_id.is.null`)
    }

    const { data } = await query
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    const event = data as Event

    const { data: absences } = await supabase
      .from('absences')
      .select('athlete_id, injury')
      .eq('event_id', event.id)

    // Convocati: la rosa della squadra dell'evento, o tutti se non ne ha.
    const called = event.team_id
      ? (() => {
          const ids = new Set(
            members.filter((m) => m.team_id === event.team_id).map((m) => m.athlete_id)
          )
          return roster.filter((a) => ids.has(a.id))
        })()
      : roster

    return {
      event,
      absent: (absences ?? []) as { athlete_id: string; injury: boolean }[],
      roster: called,
      teamName: event.team_id
        ? (teams.find((t) => t.id === event.team_id)?.name ?? 'Squadra rimossa')
        : null,
    }
  }

  const [training, match] = await Promise.all([nextEvent('training'), nextEvent('match')])

  return (
    <>
      <Nav profile={profile} />

      <main className="wrap pb-16">
        <div className="page-head">
          <p className="eyebrow">// Appello</p>
          <h1 className="h1">Prossimi impegni</h1>
          <p className="sub">
            {!staff
              ? me
                ? 'Segnala solo se non ci sarai. Chi non dice niente risulta presente.'
                : 'Il tuo account non è ancora collegato a una scheda atleta: chiedi all’allenatore.'
              : roster.length > 0
                ? `${roster.length} giocatori in rosa. Tutti presenti finché non segni il contrario.`
                : 'La rosa è ancora vuota.'}
          </p>
        </div>

        {staff && teams.length > 0 && (
          <div className="filters mb-4">
            <Link
              href="/"
              className="pill"
              data-on={team === null}
              scroll={false}
            >
              Tutte le squadre
            </Link>
            {teams.map((t) => (
              <Link
                key={t.id}
                href={`/?team=${t.id}`}
                className="pill"
                data-on={team === t.id}
                scroll={false}
              >
                {t.name}
              </Link>
            ))}
          </div>
        )}

        {!staff && myTeams.length > 0 && (
          <p className="mb-4 flex flex-wrap gap-2">
            {myTeams.map((t) => (
              <span key={t.id} className="pill" data-on="true">
                {t.name}
              </span>
            ))}
          </p>
        )}

        {roster.length === 0 ? (
          <div className="panel p-6">
            <p style={{ color: 'var(--color-muted)' }}>
              Senza giocatori non c’è appello da fare.
            </p>
            {profile.role === 'admin' && (
              <Link href="/atleti" className="btn btn-primary mt-5">
                Aggiungi i giocatori
              </Link>
            )}
          </div>
        ) : (
          <EventSwitch
            key={staff ? (team ?? 'all') : 'mine'}
            training={training}
            match={match}
            userId={profile.id}
            lockedAthleteId={staff ? null : (me?.id ?? null)}
            canClose={staff}
          />
        )}
      </main>
    </>
  )
}
