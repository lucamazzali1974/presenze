-- =====================================================================
-- Parte 12 — il flag "non convocato"
--
-- Correzione alla parte 11. Li' bastava non mettere un giocatore in una
-- formazione perche' la partita sparisse dalle sue percentuali: comodo,
-- ma sbagliato. Chi non c'e' e' assente, punto; e' la regola di sempre e
-- deve restare quella predefinita, altrimenti basta dimenticarsi di
-- compilare le formazioni per far sparire le assenze di tutti.
--
-- Da qui il "non convocato" e' una scelta dichiarata: un flag
-- sull'assenza. Finche' non lo metti, l'assenza pesa come prima. Quando
-- lo metti, quell'evento esce dai conti di quel giocatore — ne' presenza
-- ne' assenza, come se per lui non fosse in calendario.
--
-- Eseguire nel SQL Editor di Supabase, dopo la 011. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA COLONNA
-- Vive sull'assenza perche' "non convocato" e' un modo di non esserci:
-- la riga esiste (qualcuno l'ha dichiarato), ma non viene conteggiata.
-- ---------------------------------------------------------------------

alter table public.absences
  add column if not exists not_called boolean not null default false;

-- Infortunato e non convocato insieme non vogliono dire niente: il primo
-- conta come assenza, il secondo toglie l'evento dai conti.
alter table public.absences drop constraint if exists absences_reason_check;
alter table public.absences
  add constraint absences_reason_check check (not (injury and not_called));

create index if not exists absences_not_called_idx
  on public.absences (event_id) where not_called;


-- ---------------------------------------------------------------------
-- 2. IL FLAG LO METTE LO STAFF
-- Senza questa guardia un atleta si toglierebbe da solo dalle
-- statistiche: gli basterebbe segnarsi "non convocato" al posto di
-- "assente", e la sua policy sulle assenze glielo permetterebbe.
-- ---------------------------------------------------------------------

create or replace function public.guard_not_called()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.not_called and auth.uid() is not null and not public.is_staff() then
    raise exception 'Solo lo staff puo'' segnare un giocatore come non convocato.';
  end if;

  return new;
end;
$$;

drop trigger if exists absences_guard_not_called on public.absences;
create trigger absences_guard_not_called
  before insert or update on public.absences
  for each row execute function public.guard_not_called();


-- ---------------------------------------------------------------------
-- 3. CHI RIGUARDA UN EVENTO: si torna alla squadra
--
-- La funzione resta (la citano le viste) ma smette di guardare le
-- formazioni: un evento riguarda chi e' nella sua squadra, e le
-- formazioni tornano a essere quello che sono — l'organizzazione della
-- giornata, non il registro di chi va conteggiato.
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
  select public.event_covers_athlete(p_team_id, p_athlete_id);
$$;

/* L'atleta segna se stesso su ogni evento della sua squadra, formazioni
   o no: se non lo convocano, glielo dice lo staff col flag. */
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
              and public.event_covers_athlete(e.team_id, p_athlete_id)
         );
$$;


-- ---------------------------------------------------------------------
-- 4. PERCENTUALI
--
-- expected  = gli eventi che lo riguardavano, tolti i "non convocato"
-- attended  = quelli senza riga di assenza (presente = nessun record)
-- injuries  = le assenze per infortunio, che restano assenze
--
-- Chi ha solo "non convocato" non produce nessuna riga: in elenco
-- comparira' con un trattino, come chi non ha ancora nessun appello.
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
left join public.absences ab
  on ab.event_id = e.id
 and ab.athlete_id = a.id
where a.active
  and public.can_view('percentuali')
  and (public.is_staff() or a.id = public.my_athlete_id())
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id
having count(*) filter (where not coalesce(ab.not_called, false)) > 0;


-- ---------------------------------------------------------------------
-- 5. ARCHIVI — stessa regola, o la fotografia non somiglia all'originale
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
-- 6. SEGNA IN BLOCCO CHI E' FUORI DALLE FORMAZIONI
--
-- Il gesto tipico del concentramento: fatte le squadre, chi resta fuori
-- va segnato. Una chiamata sola invece di venti tocchi sul tabellone.
--
-- p_not_called decide come:
--   false -> assenti normali, che pesano sulle percentuali
--   true  -> non convocati, e la partita esce dai loro conti
--
-- Non tocca chi ha gia' una posizione sul tabellone, e restituisce
-- quanti ne ha segnati.
-- ---------------------------------------------------------------------

drop function if exists public.mark_uncalled(uuid);

create or replace function public.mark_uncalled(
  p_event_id   uuid,
  p_not_called boolean default true
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team  uuid;
  v_count int;
begin
  if not (public.is_staff() and public.can_edit('appello')) then
    raise exception 'non autorizzato';
  end if;

  select e.team_id into v_team
    from public.events e
   where e.id = p_event_id and e.archive_id is null;

  if not found then
    raise exception 'evento inesistente o archiviato';
  end if;

  if not exists (select 1 from public.lineups l where l.event_id = p_event_id) then
    raise exception 'Questa partita non ha formazioni: non c''e'' un «fuori» da segnare.';
  end if;

  insert into public.absences (event_id, athlete_id, not_called, marked_by)
  select p_event_id, a.id, coalesce(p_not_called, true), auth.uid()
    from public.athletes a
   where a.active
     and public.event_covers_athlete(v_team, a.id)
     and not exists (
           select 1 from public.lineup_members lm
            where lm.event_id = p_event_id and lm.athlete_id = a.id
         )
     and not exists (
           select 1 from public.absences ab
            where ab.event_id = p_event_id and ab.athlete_id = a.id
         );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. PERMESSI SUGLI OGGETTI NUOVI
--
-- Supabase li darebbe da solo (ha i default privileges impostati sullo
-- schema public), ma una vista ricreata da una migrazione e' un oggetto
-- nuovo: se quei default mancassero, l'app vedrebbe "permission denied"
-- e non un problema di RLS. Meglio dirlo a voce alta. Il blocco si salta
-- da solo dove i ruoli di Supabase non esistono.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.attendance_stats to authenticated;
    grant select on public.match_results    to authenticated;
    grant select on public.scorer_stats     to authenticated;
    grant select, insert, update, delete
      on public.lineups, public.lineup_members, public.scores to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.attendance_stats, public.match_results,
                 public.scorer_stats, public.lineups,
                 public.lineup_members, public.scores to service_role;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 8. VERIFICA
-- ---------------------------------------------------------------------

-- I non convocati registrati finora:
-- select e.starts_at, e.type, a.last_name
--   from public.absences ab
--   join public.events e   on e.id = ab.event_id
--   join public.athletes a on a.id = ab.athlete_id
--  where ab.not_called
--  order by e.starts_at desc;
