import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/utils/supabase/admin'
import { EVENT_LABEL, formatEventTime, localToISO } from '@/lib/format'
import type { Athlete, Event } from '@/lib/types'

// web-push usa le crypto di Node: non gira sul runtime edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TZ = 'Europe/Rome'

/** La data di oggi in Italia, come YYYY-MM-DD. */
function romeToday(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** L'ora italiana corrente, 0-23. Il job gira in UTC, qui serve l'ora locale. */
function romeHour(now: Date) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false,
    }).format(now)
  )
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET non configurato' }, { status: 500 })
  }

  // Vercel Cron manda l'header, GitHub Actions passa il parametro.
  const bearer = request.headers.get('authorization')
  const given = bearer?.startsWith('Bearer ') ? bearer.slice(7) : url.searchParams.get('secret')

  if (given !== secret) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'chiavi VAPID non configurate' }, { status: 500 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@presenze.app',
    publicKey,
    privateKey
  )

  const now = new Date()
  const force = url.searchParams.get('force') === '1'

  /*
   * Il workflow parte due volte (07:00 e 08:00 UTC) perche' l'ora legale
   * sposta l'orario italiano e cron non lo sa. Qui si tiene solo la
   * corsa che cade nelle 9 del mattino in Italia: l'altra esce subito.
   */
  const hour = romeHour(now)
  if (!force && hour !== 9) {
    return NextResponse.json({ skipped: `ora italiana ${hour}, non le 9`, sent: 0 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const today = romeToday(now)

  /*
   * La giornata italiana in UTC. Scriverla a mano con un offset fisso
   * sarebbe sbagliato meta' dell'anno: localToISO calcola l'offset vero
   * per quella data, ora legale compresa. Intervallo semiaperto, cosi'
   * la mezzanotte non finisce in due giorni.
   */
  const dayStart = localToISO(today, '00:00')
  const tomorrow = new Date(`${today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const dayEnd = localToISO(tomorrow.toISOString().slice(0, 10), '00:00')

  // Eventi di oggi ancora da fare: appello aperto e non archiviati.
  const { data: eventsData, error: eventsError } = await admin
    .from('events')
    .select('*')
    .is('archive_id', null)
    .is('closed_at', null)
    .gte('starts_at', dayStart)
    .lt('starts_at', dayEnd)
    .order('starts_at', { ascending: true })

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  const events = (eventsData ?? []) as Event[]
  if (events.length === 0) {
    return NextResponse.json({ today, events: 0, sent: 0 })
  }

  // Solo i giocatori con un account atleta: lo staff non riceve niente.
  const [{ data: athletesData }, { data: membersData }, { data: profilesData }] =
    await Promise.all([
      admin.from('athletes').select('*').eq('active', true).not('profile_id', 'is', null),
      admin.from('team_members').select('*'),
      admin.from('profiles').select('id, role, status').eq('role', 'athlete'),
    ])

  const athletes = (athletesData ?? []) as Athlete[]
  const members = (membersData ?? []) as { team_id: string; athlete_id: string }[]
  const activeAthleteProfiles = new Set(
    ((profilesData ?? []) as { id: string; status: string }[])
      .filter((p) => p.status === 'active')
      .map((p) => p.id)
  )

  const { data: subsData } = await admin.from('push_subscriptions').select('*')
  const subs = (subsData ?? []) as {
    id: string
    profile_id: string
    endpoint: string
    p256dh: string
    auth: string
  }[]

  const subsByProfile = new Map<string, typeof subs>()
  for (const s of subs) {
    subsByProfile.set(s.profile_id, [...(subsByProfile.get(s.profile_id) ?? []), s])
  }

  let sent = 0
  let failed = 0
  const stale: string[] = []
  const handled: string[] = []

  for (const event of events) {
    /*
     * Il registro fa da lucchetto: se la riga di oggi c'e' gia', il
     * promemoria per questo evento e' partito e non si ripete. Si
     * scrive prima di spedire, non dopo.
     */
    const { error: logError } = await admin
      .from('reminder_log')
      .insert({ event_id: event.id, sent_on: today })

    if (logError) continue // 23505: gia' mandato oggi

    // Convocati: la rosa della squadra dell'evento, o tutti se non ne ha.
    const called = event.team_id
      ? athletes.filter((a) =>
          members.some((m) => m.team_id === event.team_id && m.athlete_id === a.id)
        )
      : athletes

    // Chi si e' gia' segnato assente non va disturbato.
    const { data: absencesData } = await admin
      .from('absences')
      .select('athlete_id')
      .eq('event_id', event.id)

    const absent = new Set(
      ((absencesData ?? []) as { athlete_id: string }[]).map((a) => a.athlete_id)
    )

    const targets = called.filter(
      (a) =>
        a.profile_id &&
        !absent.has(a.id) &&
        activeAthleteProfiles.has(a.profile_id)
    )

    const payload = JSON.stringify({
      title: `Oggi ${EVENT_LABEL[event.type].toLowerCase()} alle ${formatEventTime(event.starts_at)}`,
      body: event.location
        ? `${event.location} — segnala se non ci sarai`
        : 'Segnala se non ci sarai',
      url: `/events/${event.id}`,
      tag: `evento-${event.id}`,
    })

    let delivered = 0

    for (const athlete of targets) {
      for (const sub of subsByProfile.get(athlete.profile_id!) ?? []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          delivered++
          sent++
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          // 404 e 410: il browser ha buttato l'iscrizione, va rimossa.
          if (status === 404 || status === 410) stale.push(sub.endpoint)
          else failed++
        }
      }
    }

    await admin
      .from('reminder_log')
      .update({ sent_to: delivered })
      .eq('event_id', event.id)
      .eq('sent_on', today)

    handled.push(event.id)
  }

  if (stale.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', stale)
  }

  return NextResponse.json({
    today,
    events: handled.length,
    sent,
    failed,
    removedStale: stale.length,
  })
}
