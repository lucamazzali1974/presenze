-- =====================================================================
-- Parte 6 — accesso degli atleti
--
-- Un atleta entra con un suo account e segna SOLO la propria assenza,
-- solo su eventi non ancora chiusi e della squadra di cui fa parte.
-- Il limite lo impone la RLS, non il frontend: da fuori app, con la
-- chiave pubblica, non si puo' aggirare.
--
-- Nessun dato esistente viene toccato: gli atleti gia' inseriti restano
-- dove sono, con profile_id nullo, e continuano a funzionare come oggi
-- finche' non li colleghi a un account.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. IL RUOLO
-- ---------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'athlete'));


-- ---------------------------------------------------------------------
-- 2. COLLEGAMENTO ANAGRAFICA <-> ACCOUNT
-- unique: un account vale per un atleta solo, e viceversa.
-- on delete set null: cancellare l'accesso non cancella il giocatore.
-- ---------------------------------------------------------------------

alter table public.athletes
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create unique index if not exists athletes_profile_idx
  on public.athletes (profile_id) where profile_id is not null;


-- ---------------------------------------------------------------------
-- 3. HELPER
-- is_active() resta "qualunque utente attivo" e serve alle letture.
-- is_staff() e' il vecchio significato di is_active(): chi fa l'appello.
-- ---------------------------------------------------------------------

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role in ('user', 'admin')
  );
$$;

create or replace function public.my_athlete_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select a.id
    from public.athletes a
   where a.profile_id = auth.uid()
   limit 1;
$$;

/* Cosa puo' toccare un atleta: la propria riga, su un evento aperto,
   non archiviato, e che lo riguarda davvero (la sua squadra). */
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
-- 4. RLS SULLE ASSENZE
-- Le vecchie policy davano scrittura piena a "qualunque utente attivo":
-- con gli atleti dentro vorrebbe dire che chiunque segna chiunque.
-- ---------------------------------------------------------------------

drop policy if exists "absences: inserimento utenti attivi"  on public.absences;
drop policy if exists "absences: cancellazione utenti attivi" on public.absences;
drop policy if exists "absences: modifica utenti attivi"      on public.absences;

drop policy if exists "absences: staff scrive" on public.absences;
create policy "absences: staff scrive"
  on public.absences for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "absences: atleta segna se stesso" on public.absences;
create policy "absences: atleta segna se stesso"
  on public.absences for insert
  with check (public.athlete_can_mark(event_id, athlete_id));

drop policy if exists "absences: atleta modifica la propria" on public.absences;
create policy "absences: atleta modifica la propria"
  on public.absences for update
  using (public.athlete_can_mark(event_id, athlete_id))
  with check (public.athlete_can_mark(event_id, athlete_id));

drop policy if exists "absences: atleta cancella la propria" on public.absences;
create policy "absences: atleta cancella la propria"
  on public.absences for delete
  using (public.athlete_can_mark(event_id, athlete_id));

-- La lettura resta aperta a tutti gli attivi: sul tabellone l'atleta
-- vede quanti sono i presenti, anche se puo' cambiare solo se stesso.


-- ---------------------------------------------------------------------
-- 5. PERCENTUALI: l'atleta vede solo la propria riga
-- Filtro nella vista, non nella pagina: vale anche per chi interroga
-- l'API direttamente.
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
  and (public.is_staff() or a.id = public.my_athlete_id())
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id;


-- ---------------------------------------------------------------------
-- 6. ARCHIVI SOLO ALLO STAFF
-- archives.snapshot contiene le percentuali di tutti: lasciarlo leggere
-- agli atleti vanificherebbe il punto 5.
-- ---------------------------------------------------------------------

drop policy if exists "archives: lettura utenti attivi" on public.archives;
create policy "archives: lettura staff"
  on public.archives for select
  using (public.is_staff());


-- ---------------------------------------------------------------------
-- 7. CHIUSURA DELL'APPELLO
--
-- events e' scrivibile solo dagli admin ("events: scrittura admin", che
-- copre anche l'update), quindi un atleta non puo' gia' oggi chiudere
-- un appello. Ma la stessa policy blocca anche gli allenatori, mentre
-- setEventClosed richiede il solo profilo attivo: cliccando "Chiudi
-- appello" un allenatore non-admin riceve un errore di permessi.
--
-- Si risolve con una funzione dedicata invece di allargare la policy di
-- update: allargarla darebbe allo staff anche la possibilita' di
-- riscrivere data, luogo e squadra di qualunque evento. Qui si tocca
-- solo closed_at.
-- ---------------------------------------------------------------------

create or replace function public.set_event_closed(
  p_event_id uuid,
  p_closed   boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'non autorizzato';
  end if;

  update public.events
     set closed_at = case when p_closed then now() else null end
   where id = p_event_id
     and archive_id is null;

  if not found then
    raise exception 'evento inesistente o archiviato';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. VERIFICA — chi e' collegato a cosa.
-- ---------------------------------------------------------------------

-- select a.last_name, a.first_name, p.email, p.role, p.status
--   from public.athletes a
--   left join public.profiles p on p.id = a.profile_id
--  order by a.last_name;
