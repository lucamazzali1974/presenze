-- =====================================================================
-- Migrazione 002 — infortuni e archivi
-- Eseguire nel SQL Editor di Supabase, tutto in una volta.
-- Sicura da rilanciare: usa if not exists / or replace ovunque.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. INFORTUNIO SULL'ASSENZA
-- ---------------------------------------------------------------------

alter table public.absences
  add column if not exists injury boolean not null default false;

-- Serve una policy di UPDATE: prima le assenze si potevano solo
-- creare e cancellare, ora vanno anche modificate.
drop policy if exists "absences: modifica utenti attivi" on public.absences;
create policy "absences: modifica utenti attivi"
  on public.absences for update
  using (public.is_active())
  with check (public.is_active());


-- ---------------------------------------------------------------------
-- 2. ARCHIVI
-- Un archivio congela un periodo: gli eventi compresi escono dal
-- calendario e dalle percentuali correnti, e le percentuali di quel
-- periodo restano fotografate in snapshot.
-- ---------------------------------------------------------------------

create table if not exists public.archives (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  from_date    date not null,
  to_date      date not null,
  snapshot     jsonb not null default '[]'::jsonb,
  events_count int not null default 0,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

alter table public.events
  add column if not exists archive_id uuid references public.archives (id) on delete set null;

create index if not exists events_archive_idx on public.events (archive_id);

alter table public.archives enable row level security;

drop policy if exists "archives: lettura utenti attivi" on public.archives;
create policy "archives: lettura utenti attivi"
  on public.archives for select
  using (public.is_active());

drop policy if exists "archives: scrittura admin" on public.archives;
create policy "archives: scrittura admin"
  on public.archives for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 3. VISTE
-- Le viste correnti ignorano tutto cio' che e' archiviato.
-- attendance_stats guadagna la colonna injuries, quindi va ricreata.
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
  count(*)                       as expected,
  count(*) - count(ab.event_id)  as attended,
  round(100.0 * (count(*) - count(ab.event_id)) / count(*), 1) as pct,
  count(ab.event_id) filter (where ab.injury) as injuries
from public.athletes a
join public.events e
  on e.closed_at is not null
 and e.archive_id is null
 and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
group by a.id, a.first_name, a.last_name, a.nickname, e.type;

create or replace view public.upcoming_events
with (security_invoker = on) as
select *
from public.events
where starts_at >= now() - interval '4 hours'
  and archive_id is null
order by starts_at;


-- ---------------------------------------------------------------------
-- 4. FUNZIONI DI ARCHIVIO
-- ---------------------------------------------------------------------

/* Crea l'archivio: fotografa le percentuali del periodo e sposta
   dentro tutti gli eventi non ancora archiviati. */
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
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;

  if p_to < p_from then
    raise exception 'La data di fine precede quella di inizio.';
  end if;

  insert into public.archives (name, from_date, to_date, created_by)
  values (nullif(btrim(p_name), ''), p_from, p_to, auth.uid())
  returning id into v_id;

  -- Le percentuali si calcolano PRIMA di archiviare, altrimenti
  -- il filtro archive_id is null le azzererebbe.
  select coalesce(jsonb_agg(t), '[]'::jsonb)
    into v_snapshot
  from (
    select
      a.id        as athlete_id,
      a.first_name,
      a.last_name,
      a.nickname,
      e.type,
      count(*)                       as expected,
      count(*) - count(ab.event_id)  as attended,
      round(100.0 * (count(*) - count(ab.event_id)) / count(*), 1) as pct,
      count(ab.event_id) filter (where ab.injury) as injuries
    from public.athletes a
    join public.events e
      on e.closed_at is not null
     and e.archive_id is null
     and (e.starts_at at time zone 'Europe/Rome')::date between p_from and p_to
     and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
    left join public.absences ab
      on ab.event_id = e.id
     and ab.athlete_id = a.id
    group by a.id, a.first_name, a.last_name, a.nickname, e.type
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

/* Riporta gli eventi nel calendario corrente e rimuove l'archivio. */
create or replace function public.restore_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;

  update public.events set archive_id = null where archive_id = p_id;
  delete from public.archives where id = p_id;
end;
$$;

/* Elimina per sempre: eventi del periodo, relative presenze, archivio. */
create or replace function public.purge_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;

  delete from public.events where archive_id = p_id;
  delete from public.archives where id = p_id;
end;
$$;
