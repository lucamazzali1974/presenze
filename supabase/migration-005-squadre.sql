-- =====================================================================
-- Parte 5 — squadre
--
-- Un atleta puo' stare in piu' squadre (l'U18 che gioca anche in prima).
-- Un evento appartiene a una squadra, oppure a nessuna: team_id nullo
-- significa "tutta la societa'" e vale per chiunque. Gli eventi che
-- esistono gia' restano cosi', e li assegni con calma.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELLE
-- ---------------------------------------------------------------------

create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Appartenenza: tabella ponte, non una colonna su athletes.
create table if not exists public.team_members (
  team_id    uuid not null references public.teams    on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade,
  primary key (team_id, athlete_id)
);
create index if not exists team_members_athlete_idx on public.team_members (athlete_id);

alter table public.events
  add column if not exists team_id uuid references public.teams (id) on delete set null;

create index if not exists events_team_idx on public.events (team_id);


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "teams: lettura utenti attivi" on public.teams;
create policy "teams: lettura utenti attivi"
  on public.teams for select
  using (public.is_active());

drop policy if exists "teams: scrittura admin" on public.teams;
create policy "teams: scrittura admin"
  on public.teams for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "team_members: lettura utenti attivi" on public.team_members;
create policy "team_members: lettura utenti attivi"
  on public.team_members for select
  using (public.is_active());

drop policy if exists "team_members: scrittura admin" on public.team_members;
create policy "team_members: scrittura admin"
  on public.team_members for all
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------
-- 3. REGOLA DI CONTEGGIO
-- Un evento "riguarda" un atleta se non ha squadra (vale per tutti)
-- oppure se l'atleta e' iscritto a quella squadra. Senza questa regola
-- un U18 risulterebbe assente a ogni allenamento della prima squadra.
-- ---------------------------------------------------------------------

create or replace function public.event_covers_athlete(
  p_team_id uuid,
  p_athlete_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_team_id is null
      or exists (
           select 1 from public.team_members tm
            where tm.team_id = p_team_id
              and tm.athlete_id = p_athlete_id
         );
$$;


-- ---------------------------------------------------------------------
-- 4. VISTA PERCENTUALI
-- Guadagna la dimensione team_id: una riga per atleta, tipo e squadra.
-- Il totale su piu' squadre lo somma l'app, cosi' la stessa vista serve
-- sia la pagina filtrata per squadra sia quella complessiva.
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
  count(*)                       as expected,
  count(*) - count(ab.event_id)  as attended,
  round(100.0 * (count(*) - count(ab.event_id)) / count(*), 1) as pct,
  count(ab.event_id) filter (where ab.injury) as injuries
from public.athletes a
join public.events e
  on e.closed_at is not null
 and e.archive_id is null
 and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
 and public.event_covers_athlete(e.team_id, a.id)
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id;


-- ---------------------------------------------------------------------
-- 5. ARCHIVI
-- La fotografia resta aggregata senza squadra (stessa forma di prima,
-- cosi' gli archivi gia' creati continuano a leggersi), ma ora rispetta
-- l'appartenenza: niente eventi di squadre a cui l'atleta non e' iscritto.
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
  if not public.is_admin() then
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
     and public.event_covers_athlete(e.team_id, a.id)
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


-- ---------------------------------------------------------------------
-- 6. EVENTI RICORRENTI CON SQUADRA
-- Si elimina la vecchia firma: tenerle entrambe renderebbe ambigua
-- la chiamata RPC con argomenti nominali.
-- ---------------------------------------------------------------------

drop function if exists public.create_recurring_events(text, int[], time, date, date, text, text);

create function public.create_recurring_events(
  p_type     text,
  p_weekdays int[],
  p_time     time,
  p_from     date,
  p_to       date,
  p_title    text default null,
  p_location text default null,
  p_team_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series uuid := gen_random_uuid();
  d date := p_from;
begin
  if not public.is_admin() then
    raise exception 'non autorizzato';
  end if;

  if p_to - p_from > 400 then
    raise exception 'intervallo troppo ampio (max ~13 mesi)';
  end if;

  if p_team_id is not null
     and not exists (select 1 from public.teams t where t.id = p_team_id) then
    raise exception 'squadra inesistente';
  end if;

  while d <= p_to loop
    if extract(isodow from d)::int = any (p_weekdays) then
      insert into public.events
        (type, title, location, starts_at, series_id, team_id, created_by)
      values
        (p_type, p_title, p_location,
         (d + p_time) at time zone 'Europe/Rome',
         v_series, p_team_id, auth.uid());
    end if;
    d := d + 1;
  end loop;

  return v_series;
end;
$$;
