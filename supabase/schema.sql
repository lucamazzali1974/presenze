-- =====================================================================
-- App Presenze — schema completo per Supabase (Postgres 15+)
-- Modello: si salvano SOLO le assenze. Presente = assenza di record.
-- Eseguire tutto in una volta nel SQL Editor di Supabase.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELLE
-- ---------------------------------------------------------------------

-- Utenti dell'app (1:1 con auth.users). Nuovo iscritto = status 'pending'.
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user'
             check (role in ('user', 'admin')),
  status     text not null default 'pending'
             check (status in ('pending', 'active', 'blocked')),
  created_at timestamptz not null default now()
);

-- Anagrafica atleti: entita' separata dagli utenti che fanno login.
-- joined_on serve a NON conteggiare gli eventi precedenti al suo ingresso.
create table public.athletes (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  nickname   text,
  active     boolean not null default true,
  joined_on  date not null default current_date,
  created_at timestamptz not null default now()
);
create index athletes_active_idx on public.athletes (active, last_name);

-- Allenamenti e partite. Le ricorrenze sono materializzate: N righe con
-- lo stesso series_id, non una regola da calcolare a runtime.
-- closed_at = l'appello e' stato fatto (distingue "tutti presenti" da
-- "nessuno ha compilato"): solo gli eventi chiusi entrano nelle statistiche.
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('training', 'match')),
  starts_at  timestamptz not null,
  title      text,
  location   text,
  series_id  uuid,
  closed_at  timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index events_starts_at_idx on public.events (starts_at desc);
create index events_series_idx    on public.events (series_id);

-- Solo le assenze. Il toggle dell'appello e' un INSERT o un DELETE.
create table public.absences (
  event_id   uuid not null references public.events   on delete cascade,
  athlete_id uuid not null references public.athletes on delete cascade,
  note       text,
  marked_by  uuid references public.profiles (id),
  marked_at  timestamptz not null default now(),
  primary key (event_id, athlete_id)
);


-- ---------------------------------------------------------------------
-- 2. PROFILO AUTOMATICO ALLA REGISTRAZIONE
-- ---------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 3. HELPER PER LE POLICY
-- Sono SECURITY DEFINER: leggono profiles bypassando la RLS ed evitano
-- la ricorsione infinita "policy su profiles che interroga profiles".
-- ---------------------------------------------------------------------

create function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;


-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles  enable row level security;
alter table public.athletes  enable row level security;
alter table public.events    enable row level security;
alter table public.absences  enable row level security;

-- profiles: ognuno vede il proprio (serve alla pagina /pending),
-- l'admin vede e modifica tutti.
create policy "profiles: leggo il mio"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin legge tutti"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: admin modifica tutti"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- athletes: lettura a chiunque sia attivo, scrittura solo admin.
create policy "athletes: lettura utenti attivi"
  on public.athletes for select
  using (public.is_active());

create policy "athletes: scrittura admin"
  on public.athletes for all
  using (public.is_admin())
  with check (public.is_admin());

-- events: idem.
create policy "events: lettura utenti attivi"
  on public.events for select
  using (public.is_active());

create policy "events: scrittura admin"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());

-- absences: l'appello lo fa qualunque utente attivo.
create policy "absences: lettura utenti attivi"
  on public.absences for select
  using (public.is_active());

create policy "absences: inserimento utenti attivi"
  on public.absences for insert
  with check (public.is_active());

create policy "absences: cancellazione utenti attivi"
  on public.absences for delete
  using (public.is_active());

-- Nota: se vuoi che gli utenti normali possano solo LEGGERE e non
-- compilare l'appello, cancella le due policy qui sopra di scrittura
-- e sostituisci is_active() con is_admin().


-- ---------------------------------------------------------------------
-- 5. VISTE
-- security_invoker = on fa applicare la RLS di chi interroga.
-- ---------------------------------------------------------------------

-- Percentuali presenze, una riga per atleta e per tipo evento.
-- expected = eventi chiusi successivi al suo ingresso.
create view public.attendance_stats
with (security_invoker = on) as
select
  a.id        as athlete_id,
  a.first_name,
  a.last_name,
  a.nickname,
  e.type,
  count(*)                        as expected,
  count(*) - count(ab.event_id)   as attended,
  round(100.0 * (count(*) - count(ab.event_id)) / count(*), 1) as pct
from public.athletes a
join public.events e
  on e.closed_at is not null
 and e.starts_at::date >= a.joined_on
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
group by a.id, a.first_name, a.last_name, a.nickname, e.type;

-- Prossimi eventi (tolleranza di 4 ore per compilare l'appello a posteriori).
create view public.upcoming_events
with (security_invoker = on) as
select *
from public.events
where starts_at >= now() - interval '4 hours'
order by starts_at;


-- ---------------------------------------------------------------------
-- 6. GENERAZIONE EVENTI RICORRENTI
-- p_weekdays usa lo standard ISO: 1 = lunedi ... 7 = domenica.
-- L'ora viene interpretata in Europe/Rome, cosi' un allenamento alle
-- 20:00 resta alle 20:00 anche dopo il cambio dell'ora.
-- ---------------------------------------------------------------------

create function public.create_recurring_events(
  p_type     text,
  p_weekdays int[],
  p_time     time,
  p_from     date,
  p_to       date,
  p_title    text default null,
  p_location text default null
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

  while d <= p_to loop
    if extract(isodow from d)::int = any (p_weekdays) then
      insert into public.events
        (type, title, location, starts_at, series_id, created_by)
      values
        (p_type, p_title, p_location,
         (d + p_time) at time zone 'Europe/Rome',
         v_series, auth.uid());
    end if;
    d := d + 1;
  end loop;

  return v_series;
end;
$$;

-- Esempio: allenamenti martedi e giovedi alle 20:30 da settembre a maggio
-- select public.create_recurring_events(
--   'training', array[2,4], '20:30', '2026-09-15', '2027-05-31',
--   'Allenamento', 'Palestra comunale'
-- );


-- ---------------------------------------------------------------------
-- 7. PRIMO ADMIN
-- Registrati dall'app, poi esegui questa riga con la tua email.
-- ---------------------------------------------------------------------

-- update public.profiles
--    set role = 'admin', status = 'active'
--  where email = 'tua@email.it';
-- =====================================================================
-- Parte 2 — infortuni e archivi
-- (su un database gia' avviato corrisponde a migration-002-archivi.sql)
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
