-- =====================================================================
-- Parte 14 — gli incontri dentro la formazione
--
-- Fino alla 013 una formazione era UNA partita: un avversario, un
-- orario, un risultato. Al triangolare (o a qualunque concentramento in
-- cui la stessa squadra gioca piu' volte) gli stessi convocati
-- affrontano due o tre avversari, ognuno col suo risultato e le sue
-- marcature. Duplicare la formazione non si puo' — un atleta sta in una
-- formazione sola per partita — e non avrebbe senso: i convocati sono
-- quelli.
--
-- Da qui la gerarchia e':
--
--   partita (evento)  ->  formazioni (convocati)  ->  incontri (games)
--
-- e l'incontro porta avversario, orario, risultato e marcature. La
-- partita singola e' semplicemente una formazione con un incontro solo.
--
-- Migrazione dei dati esistenti: ogni formazione riceve un incontro con
-- il suo avversario, orario e risultato, e le marcature passano a quello.
-- Le colonne opponent / starts_at / points_for / points_against restano
-- su lineups (nessun dato cancellato) ma l'app non le scrive piu':
-- risultato e marcature vivono sull'incontro.
--
-- Eseguire nel SQL Editor di Supabase, dopo la 013. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA TABELLA
-- event_id e' ridondante come su lineup_members: lo riempie il trigger
-- e serve a leggere gli incontri di una partita con una query sola.
-- opponent e starts_at nulli = si ereditano (formazione, poi evento).
-- ---------------------------------------------------------------------

create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  lineup_id      uuid not null references public.lineups (id) on delete cascade,
  event_id       uuid not null references public.events  (id) on delete cascade,
  opponent       text,
  starts_at      timestamptz,
  points_for     int check (points_for >= 0),
  points_against int check (points_against >= 0),
  sort           int not null default 100,
  created_at     timestamptz not null default now()
);

create index if not exists games_lineup_idx on public.games (lineup_id, sort);
create index if not exists games_event_idx  on public.games (event_id);

create or replace function public.set_game_event()
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

drop trigger if exists games_set_event on public.games;
create trigger games_set_event
  before insert or update of lineup_id on public.games
  for each row execute function public.set_game_event();


-- ---------------------------------------------------------------------
-- 2. UN INCONTRO PER OGNI FORMAZIONE GIA' ESISTENTE
-- Solo per le formazioni che non ne hanno ancora: rieseguire la
-- migrazione non ne crea di doppi.
-- ---------------------------------------------------------------------

insert into public.games (lineup_id, event_id, opponent, starts_at,
                          points_for, points_against, sort)
select l.id, l.event_id, l.opponent, l.starts_at,
       l.points_for, l.points_against, 10
  from public.lineups l
 where not exists (select 1 from public.games g where g.lineup_id = l.id);


-- ---------------------------------------------------------------------
-- 3. LE MARCATURE PASSANO ALL'INCONTRO
-- lineup_id resta (lo riempie il trigger dall'incontro) perche' comodo
-- per leggere e perche' lo usa la vista scorer_stats.
-- ---------------------------------------------------------------------

alter table public.scores
  add column if not exists game_id uuid references public.games (id) on delete cascade;

-- Ogni formazione esistente ha un incontro solo: le marcature vanno li'.
update public.scores s
   set game_id = g.id
  from public.games g
 where s.game_id is null
   and g.lineup_id = s.lineup_id
   and g.id = (select g2.id from public.games g2
                where g2.lineup_id = s.lineup_id
                order by g2.sort, g2.created_at limit 1);

alter table public.scores alter column game_id set not null;

-- La chiave diventa incontro + atleta + tipo.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'scores_pkey'
       and conrelid = 'public.scores'::regclass
       and pg_get_constraintdef(oid) not like '%game_id%'
  ) then
    alter table public.scores drop constraint scores_pkey;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'scores_pkey' and conrelid = 'public.scores'::regclass
  ) then
    alter table public.scores add constraint scores_pkey
      primary key (game_id, athlete_id, kind);
  end if;
end $$;

create index if not exists scores_lineup_idx on public.scores (lineup_id);

create or replace function public.set_score_lineup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select g.lineup_id into new.lineup_id
    from public.games g where g.id = new.game_id;

  if new.lineup_id is null then
    raise exception 'Incontro inesistente.';
  end if;

  return new;
end;
$$;

drop trigger if exists scores_set_lineup on public.scores;
create trigger scores_set_lineup
  before insert or update of game_id on public.scores
  for each row execute function public.set_score_lineup();


-- ---------------------------------------------------------------------
-- 4. RLS — come le formazioni: legge chi e' attivo, scrive chi ha
-- 'appello' in modifica.
-- ---------------------------------------------------------------------

alter table public.games enable row level security;

drop policy if exists "games: lettura utenti attivi" on public.games;
create policy "games: lettura utenti attivi"
  on public.games for select
  using (public.is_active());

drop policy if exists "games: scrittura con permesso" on public.games;
create policy "games: scrittura con permesso"
  on public.games for all
  using (public.is_staff() and public.can_edit('appello'))
  with check (public.is_staff() and public.can_edit('appello'));


-- ---------------------------------------------------------------------
-- 5. RISULTATI: una riga per incontro, con le marcature gia' divise
-- per tipo. Cambiano le colonne, quindi la vista si ricrea.
-- ---------------------------------------------------------------------

drop view if exists public.match_results;

create view public.match_results
with (security_invoker = on) as
select
  g.id                                              as game_id,
  l.id                                              as lineup_id,
  l.event_id,
  l.name                                            as lineup_name,
  e.team_id,
  coalesce(g.starts_at, l.starts_at, e.starts_at)   as starts_at,
  e.starts_at                                       as event_starts_at,
  coalesce(g.opponent, l.opponent, e.opponent)      as opponent,
  e.location,
  e.title,
  g.points_for,
  g.points_against,
  case
    when g.points_for is null or g.points_against is null then null
    when g.points_for > g.points_against then 'win'
    when g.points_for < g.points_against then 'loss'
    else 'draw'
  end                                               as outcome,
  (select count(*) from public.lineup_members lm where lm.lineup_id = l.id) as called,
  (select count(*) from public.games g2 where g2.lineup_id = l.id)          as games_in_lineup,
  coalesce((select sum(s.qty) from public.scores s
             where s.game_id = g.id and s.kind = 'try'), 0)        as tries,
  coalesce((select sum(s.qty) from public.scores s
             where s.game_id = g.id and s.kind = 'conversion'), 0) as conversions,
  coalesce((select sum(s.qty) from public.scores s
             where s.game_id = g.id and s.kind = 'penalty'), 0)    as penalties,
  coalesce((select sum(s.qty) from public.scores s
             where s.game_id = g.id and s.kind = 'drop'), 0)       as drops,
  coalesce((select sum(s.qty * public.score_points(s.kind))
              from public.scores s where s.game_id = g.id), 0)     as scored_points
from public.games g
join public.lineups l on l.id = g.lineup_id
join public.events  e on e.id = l.event_id
where e.type = 'match'
  and e.closed_at is not null
  and e.archive_id is null
  and public.can_view('percentuali')
  and (
    public.is_staff()
    or exists (
      select 1 from public.lineup_members lm
       where lm.lineup_id = l.id and lm.athlete_id = public.my_athlete_id()
    )
  );

/* Marcatori: come prima, piu' gli incontri in cui l'atleta ha segnato. */
drop view if exists public.scorer_stats;

create view public.scorer_stats
with (security_invoker = on) as
select
  s.athlete_id,
  e.team_id,
  coalesce(sum(s.qty) filter (where s.kind = 'try'), 0)        as tries,
  coalesce(sum(s.qty) filter (where s.kind = 'conversion'), 0) as conversions,
  coalesce(sum(s.qty) filter (where s.kind = 'penalty'), 0)    as penalties,
  coalesce(sum(s.qty) filter (where s.kind = 'drop'), 0)       as drops,
  sum(s.qty * public.score_points(s.kind))                     as points,
  count(distinct l.event_id)                                   as matches_scored,
  count(distinct s.game_id)                                    as games_scored
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
-- 6. PERMESSI SUGLI OGGETTI NUOVI (vedi la nota nella 012)
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.match_results, public.scorer_stats to authenticated;
    grant select, insert, update, delete on public.games to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.games, public.match_results, public.scorer_stats
      to service_role;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 7. VERIFICA
-- ---------------------------------------------------------------------

-- Ogni formazione deve avere almeno un incontro, ogni marcatura il suo:
-- select (select count(*) from public.lineups l
--          where not exists (select 1 from public.games g where g.lineup_id = l.id)) as formazioni_senza_incontri,
--        (select count(*) from public.scores where game_id is null) as marcature_orfane;
