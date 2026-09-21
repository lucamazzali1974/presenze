-- =====================================================================
-- Parte 11 — formazioni, risultato e marcature
--
-- Al concentramento si va con piu' squadre: stesso campo, stesso
-- avversario, ma due o tre formazioni con orari diversi e convocati
-- diversi. Un evento "partita" si spezza quindi in N formazioni
-- (lineups), ognuna con:
--   * i suoi convocati        (lineup_members)
--   * il suo orario           (starts_at / meet_at, nulli = quelli dell'evento)
--   * il suo avversario       (opponent, nullo = quello dell'evento)
--   * il suo risultato finale (points_for / points_against)
--   * le sue marcature        (scores, contatore per atleta e per tipo)
--
-- Chi non e' in nessuna formazione NON e' convocato: quella partita non
-- entra ne' tra le presenze ne' tra le assenze. Una partita senza
-- formazioni continua a funzionare come prima (vale la squadra
-- dell'evento), quindi niente di esistente si rompe.
--
-- Eseguire nel SQL Editor di Supabase. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PUNTI DEL RUGBY
-- In un posto solo: la usano la vista dei marcatori e la quadratura
-- del risultato nell'app.
-- ---------------------------------------------------------------------

create or replace function public.score_points(p_kind text)
returns int
language sql
immutable
as $$
  select case p_kind
    when 'try'        then 5   -- meta
    when 'conversion' then 2   -- trasformazione
    when 'penalty'    then 3   -- calcio piazzato
    when 'drop'       then 3   -- drop
    else 0
  end;
$$;


-- ---------------------------------------------------------------------
-- 2. TABELLE
-- ---------------------------------------------------------------------

create table if not exists public.lineups (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  name           text not null,
  -- Nulli = si eredita dall'evento. Non si copia il valore: se sposti la
  -- partita di mezz'ora, le formazioni senza orario proprio la seguono.
  starts_at      timestamptz,
  meet_at        timestamptz,
  opponent       text,
  points_for     int check (points_for >= 0),
  points_against int check (points_against >= 0),
  sort           int not null default 100,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

create index if not exists lineups_event_idx on public.lineups (event_id, sort);
create unique index if not exists lineups_name_idx on public.lineups (event_id, lower(name));

/* event_id e' ridondante (si ricava dalla formazione) ma serve al
   vincolo qui sotto: un atleta sta in UNA formazione sola per partita.
   Lo riempie il trigger, l'app non lo passa. */
create table if not exists public.lineup_members (
  lineup_id  uuid not null references public.lineups  (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  event_id   uuid not null references public.events   (id) on delete cascade,
  primary key (lineup_id, athlete_id)
);

create unique index if not exists lineup_members_one_per_event
  on public.lineup_members (event_id, athlete_id);
create index if not exists lineup_members_athlete_idx
  on public.lineup_members (athlete_id);

/* Le marcature sono un contatore, non un registro di eventi: una riga
   per atleta e tipo, qty che sale e scende col + e col -. E' la forma
   che serve a bordo campo, dove si corregge in fretta. */
create table if not exists public.scores (
  lineup_id  uuid not null references public.lineups  (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  kind       text not null check (kind in ('try', 'conversion', 'penalty', 'drop')),
  qty        int not null default 0 check (qty >= 0),
  marked_by  uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (lineup_id, athlete_id, kind)
);

create index if not exists scores_athlete_idx on public.scores (athlete_id);


-- ---------------------------------------------------------------------
-- 3. TRIGGER: event_id della formazione sui convocati
-- ---------------------------------------------------------------------

create or replace function public.set_lineup_member_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select l.event_id into new.event_id
    from public.lineups l where l.id = new.lineup_id;

  if new.event_id is null then
    raise exception 'Formazione inesistente.';
  end if;

  return new;
end;
$$;

drop trigger if exists lineup_members_set_event on public.lineup_members;
create trigger lineup_members_set_event
  before insert or update of lineup_id on public.lineup_members
  for each row execute function public.set_lineup_member_event();


-- ---------------------------------------------------------------------
-- 4. CHI RIGUARDA UN EVENTO
--
-- Prima bastava la squadra. Ora, se la partita ha delle formazioni,
-- comanda la convocazione: chi non e' stato convocato non risulta ne'
-- presente ne' assente, e la sua percentuale non ne soffre.
-- Senza formazioni si torna alla regola di prima.
-- ---------------------------------------------------------------------

create or replace function public.event_involves_athlete(
  p_event_id   uuid,
  p_team_id    uuid,
  p_athlete_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.lineups l where l.event_id = p_event_id)
      then exists (
        select 1 from public.lineup_members lm
         where lm.event_id = p_event_id
           and lm.athlete_id = p_athlete_id
      )
    else public.event_covers_athlete(p_team_id, p_athlete_id)
  end;
$$;

/* L'atleta segna se stesso solo dove e' davvero atteso: con le
   formazioni, solo se convocato. */
create or replace function public.athlete_can_mark(
  p_event_id   uuid,
  p_athlete_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_athlete_id is not null
     and p_athlete_id = public.my_athlete_id()
     and exists (
           select 1
             from public.events e
            where e.id = p_event_id
              and e.closed_at is null
              and e.archive_id is null
              and public.event_involves_athlete(e.id, e.team_id, p_athlete_id)
         );
$$;


-- ---------------------------------------------------------------------
-- 5. RLS
-- Formazioni, risultato e marcature sono lavoro da bordo campo: li fa
-- chi ha 'appello' in modifica. L'atleta li legge, non li scrive.
-- ---------------------------------------------------------------------

alter table public.lineups        enable row level security;
alter table public.lineup_members enable row level security;
alter table public.scores         enable row level security;

drop policy if exists "lineups: lettura utenti attivi" on public.lineups;
create policy "lineups: lettura utenti attivi"
  on public.lineups for select
  using (public.is_active());

drop policy if exists "lineups: scrittura con permesso" on public.lineups;
create policy "lineups: scrittura con permesso"
  on public.lineups for all
  using (public.is_staff() and public.can_edit('appello'))
  with check (public.is_staff() and public.can_edit('appello'));

drop policy if exists "lineup_members: lettura utenti attivi" on public.lineup_members;
create policy "lineup_members: lettura utenti attivi"
  on public.lineup_members for select
  using (public.is_active());

drop policy if exists "lineup_members: scrittura con permesso" on public.lineup_members;
create policy "lineup_members: scrittura con permesso"
  on public.lineup_members for all
  using (public.is_staff() and public.can_edit('appello'))
  with check (public.is_staff() and public.can_edit('appello'));

drop policy if exists "scores: lettura utenti attivi" on public.scores;
create policy "scores: lettura utenti attivi"
  on public.scores for select
  using (public.is_active());

drop policy if exists "scores: scrittura con permesso" on public.scores;
create policy "scores: scrittura con permesso"
  on public.scores for all
  using (public.is_staff() and public.can_edit('appello'))
  with check (public.is_staff() and public.can_edit('appello'));


-- ---------------------------------------------------------------------
-- 6. PERCENTUALI: la convocazione sostituisce la squadra
-- Stessa vista di prima, cambia solo la condizione di join.
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
 and public.event_involves_athlete(e.id, e.team_id, a.id)
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
  and public.can_view('percentuali')
  and (public.is_staff() or a.id = public.my_athlete_id())
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id;


-- ---------------------------------------------------------------------
-- 7. VISTE DELLE PARTITE
-- ---------------------------------------------------------------------

/* Una riga per formazione giocata: risultato, esito, marcature.
   Solo eventi chiusi e non archiviati, come le percentuali: finche'
   l'appello e' aperto la partita non e' ancora "a referto". */
create or replace view public.match_results
with (security_invoker = on) as
select
  l.id                                   as lineup_id,
  l.event_id,
  l.name                                 as lineup_name,
  e.team_id,
  coalesce(l.starts_at, e.starts_at)     as starts_at,
  coalesce(l.opponent, e.opponent)       as opponent,
  e.location,
  l.points_for,
  l.points_against,
  case
    when l.points_for is null or l.points_against is null then null
    when l.points_for > l.points_against then 'win'
    when l.points_for < l.points_against then 'loss'
    else 'draw'
  end                                    as outcome,
  (select count(*) from public.lineup_members lm where lm.lineup_id = l.id) as called,
  coalesce(
    (select sum(s.qty * public.score_points(s.kind))
       from public.scores s where s.lineup_id = l.id),
    0
  )                                      as scored_points
from public.lineups l
join public.events e on e.id = l.event_id
where e.type = 'match'
  and e.closed_at is not null
  and e.archive_id is null
  and public.can_view('percentuali')
  -- Lo staff vede tutte le partite; il giocatore quelle in cui era convocato.
  and (
    public.is_staff()
    or exists (
      select 1 from public.lineup_members lm
       where lm.lineup_id = l.id and lm.athlete_id = public.my_athlete_id()
    )
  );

/* Marcature per atleta, gia' divise per tipo e con i punti sommati.
   L'atleta vede solo la propria riga, come per le percentuali. */
create or replace view public.scorer_stats
with (security_invoker = on) as
select
  s.athlete_id,
  e.team_id,
  sum(s.qty) filter (where s.kind = 'try')        as tries,
  sum(s.qty) filter (where s.kind = 'conversion') as conversions,
  sum(s.qty) filter (where s.kind = 'penalty')    as penalties,
  sum(s.qty) filter (where s.kind = 'drop')       as drops,
  sum(s.qty * public.score_points(s.kind))        as points,
  count(distinct l.event_id)                      as matches_scored
from public.scores s
join public.lineups l on l.id = s.lineup_id
join public.events  e on e.id = l.event_id
where e.closed_at is not null
  and e.archive_id is null
  and s.qty > 0
  and public.can_view('percentuali')
  and (public.is_staff() or s.athlete_id = public.my_athlete_id())
group by s.athlete_id, e.team_id;


-- ---------------------------------------------------------------------
-- 8. ARCHIVI
-- La fotografia deve usare la stessa regola delle percentuali, o un
-- periodo archiviato conterebbe convocazioni mai fatte.
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
     and public.event_involves_athlete(e.id, e.team_id, a.id)
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
-- 9. VERIFICA
-- ---------------------------------------------------------------------

-- Formazioni di ogni partita:
-- select e.starts_at, coalesce(l.opponent, e.opponent) as avversario,
--        l.name, l.points_for, l.points_against,
--        (select count(*) from public.lineup_members m where m.lineup_id = l.id) as convocati
--   from public.lineups l join public.events e on e.id = l.event_id
--  order by e.starts_at desc, l.sort;
