-- =====================================================================
-- Parte 13 — i giorni previsti di un atleta
--
-- Caso vero: un ragazzo che di tre allenamenti a settimana ne puo' fare
-- uno solo. Contargli gli altri due come assenze e' scorretto: non e'
-- che non si presenta, e' che quel giorno non e' previsto per lui.
--
-- La regola si scrive come l'accordo preso col genitore — "viene il
-- giovedi'" — e non come una lista di eccezioni: si indicano i GIORNI
-- PREVISTI, e tutto il resto degli allenamenti esce dai suoi conti.
-- Cosi' un allenamento aggiunto al lunedi' resta fuori da solo, senza
-- doversi ricordare di escluderlo.
--
-- Vale solo per gli allenamenti. Le partite si convocano una per una, e
-- per quelle c'e' gia' il flag "non convocato" della parte 12.
--
-- Chi non ha nessuna regola conta tutto, esattamente come oggi.
--
-- Eseguire nel SQL Editor di Supabase, dopo la 012. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA TABELLA
--
-- Una riga = un accordo: dei giorni, e da quando a quando vale. Le date
-- sono facoltative (nulle = da sempre / per sempre) ma servono quando la
-- situazione cambia a meta' stagione: chiudi la vecchia regola e ne apri
-- una nuova, e le percentuali di prima restano quelle di prima.
-- ---------------------------------------------------------------------

create table if not exists public.athlete_schedules (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  -- Standard ISO, lo stesso di create_recurring_events: 1 = lunedi'.
  weekdays   int[] not null
             check (
               array_length(weekdays, 1) between 1 and 7
               and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]
             ),
  from_date  date,
  to_date    date,
  note       text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (from_date is null or to_date is null or to_date >= from_date)
);

create index if not exists athlete_schedules_athlete_idx
  on public.athlete_schedules (athlete_id);


-- ---------------------------------------------------------------------
-- 2. LA REGOLA
--
-- Un allenamento conta per un atleta se:
--   * quel giorno non ha nessuna regola in vigore  (caso normale)
--   * oppure ne ha una che comprende quel giorno della settimana
--
-- Il primo ramo e' quello che tiene in piedi tutto il resto della rosa:
-- senza regole scritte, non cambia niente per nessuno.
-- ---------------------------------------------------------------------

create or replace function public.training_counts_for(
  p_athlete_id uuid,
  p_date       date
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    not exists (
      select 1
        from public.athlete_schedules s
       where s.athlete_id = p_athlete_id
         and (s.from_date is null or p_date >= s.from_date)
         and (s.to_date   is null or p_date <= s.to_date)
    )
    or exists (
      select 1
        from public.athlete_schedules s
       where s.athlete_id = p_athlete_id
         and (s.from_date is null or p_date >= s.from_date)
         and (s.to_date   is null or p_date <= s.to_date)
         and extract(isodow from p_date)::int = any (s.weekdays)
    );
$$;

/* La stessa domanda, ma per un evento intero: le partite contano sempre. */
create or replace function public.event_counts_for(
  p_type       text,
  p_starts_at  timestamptz,
  p_athlete_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_type <> 'training'
      or public.training_counts_for(
           p_athlete_id,
           (p_starts_at at time zone 'Europe/Rome')::date
         );
$$;


-- ---------------------------------------------------------------------
-- 3. RLS
-- La rosa la legge chiunque sia attivo (serve a mostrare la regola nella
-- scheda); a scriverla e' chi gestisce l'anagrafica.
-- ---------------------------------------------------------------------

alter table public.athlete_schedules enable row level security;

drop policy if exists "athlete_schedules: lettura utenti attivi" on public.athlete_schedules;
create policy "athlete_schedules: lettura utenti attivi"
  on public.athlete_schedules for select
  using (public.is_active());

drop policy if exists "athlete_schedules: scrittura con permesso" on public.athlete_schedules;
create policy "athlete_schedules: scrittura con permesso"
  on public.athlete_schedules for all
  using (public.can_edit('atleti'))
  with check (public.can_edit('atleti'));


-- ---------------------------------------------------------------------
-- 4. PERCENTUALI
-- Unica aggiunta rispetto alla parte 12: la condizione di join.
-- ---------------------------------------------------------------------

drop view if exists public.attendance_stats;

create view public.attendance_stats
with (security_invoker = on) as
select
  a.id        as athlete_id,
  a.first_name,
  a.last_name,
  a.nickname,
  e.type,
  e.team_id,
  count(*) filter (where not coalesce(ab.not_called, false))   as expected,
  count(*) filter (where ab.event_id is null)                  as attended,
  round(
    100.0 * count(*) filter (where ab.event_id is null)
    / nullif(count(*) filter (where not coalesce(ab.not_called, false)), 0),
    1
  )                                                            as pct,
  count(*) filter (where ab.injury)                            as injuries
from public.athletes a
join public.events e
  on e.closed_at is not null
 and e.archive_id is null
 and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
 and public.event_involves_athlete(e.id, e.team_id, a.id)
 and public.event_counts_for(e.type, e.starts_at, a.id)
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
  and public.can_view('percentuali')
  and (public.is_staff() or a.id = public.my_athlete_id())
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id
having count(*) filter (where not coalesce(ab.not_called, false)) > 0;


-- ---------------------------------------------------------------------
-- 5. AFFLUENZA PER EVENTO
-- Una riga per appello chiuso: quanti erano attesi e quanti c'erano.
-- La usano i grafici (andamento nel tempo e affluenza per allenamento):
-- farla qui e' l'unico modo perche' "attesi" voglia dire la stessa cosa
-- che vuol dire nelle percentuali — squadra, ingresso in rosa, giorni
-- previsti e non convocati compresi.
-- ---------------------------------------------------------------------

create or replace view public.event_attendance
with (security_invoker = on) as
select
  e.id        as event_id,
  e.type,
  e.starts_at,
  e.team_id,
  e.title,
  e.opponent,
  count(*) filter (where not coalesce(ab.not_called, false)) as expected,
  count(*) filter (where ab.event_id is null)                as present,
  count(*) filter (where ab.injury)                          as injured,
  count(*) filter (where coalesce(ab.not_called, false))     as uncalled
from public.events e
join public.athletes a
  on a.active
 and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
 and public.event_involves_athlete(e.id, e.team_id, a.id)
 and public.event_counts_for(e.type, e.starts_at, a.id)
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where e.closed_at is not null
  and e.archive_id is null
  and public.can_view('percentuali')
  -- Il numero di presenti a un allenamento e' un dato di squadra:
  -- resta allo staff, come gli archivi.
  and public.is_staff()
group by e.id, e.type, e.starts_at, e.team_id, e.title, e.opponent
having count(*) filter (where not coalesce(ab.not_called, false)) > 0;


-- ---------------------------------------------------------------------
-- 6. ARCHIVI — stessa regola, o la fotografia mente
-- ---------------------------------------------------------------------

create or replace function public.create_archive(
  p_name text,
  p_from date,
  p_to   date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id       uuid;
  v_count    int;
  v_snapshot jsonb;
begin
  if not public.can_edit('archivio') then
    raise exception 'non autorizzato';
  end if;

  if p_to < p_from then
    raise exception 'La data di fine precede quella di inizio.';
  end if;

  insert into public.archives (name, from_date, to_date, created_by)
  values (nullif(btrim(p_name), ''), p_from, p_to, auth.uid())
  returning id into v_id;

  select coalesce(jsonb_agg(t), '[]'::jsonb)
    into v_snapshot
  from (
    select
      a.id        as athlete_id,
      a.first_name,
      a.last_name,
      a.nickname,
      e.type,
      count(*) filter (where not coalesce(ab.not_called, false)) as expected,
      count(*) filter (where ab.event_id is null)                as attended,
      round(
        100.0 * count(*) filter (where ab.event_id is null)
        / nullif(count(*) filter (where not coalesce(ab.not_called, false)), 0),
        1
      )                                                          as pct,
      count(*) filter (where ab.injury)                          as injuries
    from public.athletes a
    join public.events e
      on e.closed_at is not null
     and e.archive_id is null
     and (e.starts_at at time zone 'Europe/Rome')::date between p_from and p_to
     and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
     and public.event_involves_athlete(e.id, e.team_id, a.id)
     and public.event_counts_for(e.type, e.starts_at, a.id)
    left join public.absences ab
      on ab.event_id = e.id
     and ab.athlete_id = a.id
    group by a.id, a.first_name, a.last_name, a.nickname, e.type
    having count(*) filter (where not coalesce(ab.not_called, false)) > 0
  ) t;

  update public.events
     set archive_id = v_id
   where archive_id is null
     and (starts_at at time zone 'Europe/Rome')::date between p_from and p_to;

  get diagnostics v_count = row_count;

  if v_count = 0 then
    delete from public.archives where id = v_id;
    raise exception 'Nessun evento nel periodo indicato.';
  end if;

  update public.archives
     set snapshot = v_snapshot, events_count = v_count
   where id = v_id;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. PERMESSI SUGLI OGGETTI NUOVI
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.attendance_stats to authenticated;
    grant select on public.event_attendance to authenticated;
    grant select, insert, update, delete
      on public.athlete_schedules to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.attendance_stats, public.event_attendance,
                 public.athlete_schedules to service_role;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 8. VERIFICA
-- ---------------------------------------------------------------------

-- Chi ha una regola, e quale:
-- select a.last_name, a.first_name, s.weekdays, s.from_date, s.to_date, s.note
--   from public.athlete_schedules s
--   join public.athletes a on a.id = s.athlete_id
--  order by a.last_name;

-- Quanti allenamenti conta ciascuno rispetto al totale:
-- select a.last_name,
--        count(*) filter (where public.event_counts_for(e.type, e.starts_at, a.id)) as suoi,
--        count(*) as totali
--   from public.athletes a
--   join public.events e on e.type = 'training' and e.closed_at is not null
--  where a.active
--  group by a.last_name order by a.last_name;
