-- =====================================================================
-- Parte 10 — ruoli e permessi per sezione
--
-- Fino a qui il ruolo era una parola in una colonna: 'user', 'admin',
-- 'athlete'. Da qui il ruolo e' una riga in una tabella, l'admin ne crea
-- quanti ne vuole, e per ognuno decide sezione per sezione se e' nascosta,
-- in sola lettura o modificabile.
--
-- Due livelli, non uno:
--   * il TIPO BASE (admin | staff | athlete) dice come si comporta la RLS:
--     l'admin bypassa, lo staff opera su tutti, l'atleta solo su se stesso.
--     Non e' negoziabile, e' la sicurezza del dato.
--   * la MATRICE dei permessi dice cosa si vede e cosa si tocca. Sta sopra
--     il tipo base: restringe, non allarga oltre quello che la RLS consente.
--
-- La vecchia colonna profiles.role resta e viene tenuta allineata da un
-- trigger: is_admin(), is_staff() e tutte le policy gia' scritte continuano
-- a funzionare senza sapere niente dei ruoli nuovi.
--
-- Eseguire tutto in una volta nel SQL Editor di Supabase. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELLE
-- ---------------------------------------------------------------------

create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  base       text not null check (base in ('admin', 'staff', 'athlete')),
  is_system  boolean not null default false,
  is_default boolean not null default false,
  sort       int not null default 100,
  created_at timestamptz not null default now()
);

-- L'elenco delle sezioni sta in una funzione sola: il check, il seed e
-- my_permissions() leggono tutti da qui.
create or replace function public.permission_sections()
returns text[]
language sql
immutable
as $$
  select array[
    'appello',      -- tabellone presenze, chiusura appello
    'calendario',   -- date in programma, creazione e modifica eventi
    'atleti',       -- anagrafica rosa e accessi dei giocatori
    'percentuali',  -- statistiche di presenza
    'archivio',     -- periodi congelati
    'squadre',      -- squadre e loro composizione
    'utenti',       -- account: attivazione, blocco, assegnazione ruolo
    'ruoli'         -- questa stessa configurazione
  ];
$$;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  section text not null check (section = any (public.permission_sections())),
  level   text not null default 'none' check (level in ('none', 'view', 'edit')),
  primary key (role_id, section)
);

-- restrict: un ruolo con degli utenti addosso non sparisce per sbaglio.
alter table public.profiles
  add column if not exists role_id uuid references public.roles (id) on delete restrict;

create index if not exists profiles_role_idx on public.profiles (role_id);


-- ---------------------------------------------------------------------
-- 2. RUOLI DI SISTEMA + BACKFILL
-- Sono i tre di oggi, con gli stessi poteri di oggi: dopo questa
-- migrazione nessuno vede ne' piu' ne' meno di prima.
-- ---------------------------------------------------------------------

insert into public.roles (key, name, base, is_system, is_default, sort)
values
  ('admin',   'Amministratore', 'admin',   true, false, 10),
  ('coach',   'Allenatore',     'staff',   true, true,  20),
  ('athlete', 'Giocatore',      'athlete', true, false, 30)
on conflict (key) do nothing;

/* Scrive un livello solo se quella casella non esiste gia': rieseguire
   la migrazione non azzera le matrici che hai configurato a mano. */
create or replace function public.seed_role_permission(
  p_key text, p_section text, p_level text
)
returns void
language sql
as $$
  insert into public.role_permissions (role_id, section, level)
  select r.id, p_section, p_level from public.roles r where r.key = p_key
  on conflict (role_id, section) do nothing;
$$;

do $$
declare s text;
begin
  -- Admin: tutto. In realta' bypassa la matrice (vedi perm_level), ma la
  -- riga esiste lo stesso cosi' la pagina Ruoli non mostra caselle vuote.
  foreach s in array public.permission_sections() loop
    perform public.seed_role_permission('admin', s, 'edit');
  end loop;

  -- Allenatore: fa l'appello, guarda tutto il resto, non amministra.
  perform public.seed_role_permission('coach', 'appello',     'edit');
  perform public.seed_role_permission('coach', 'calendario',  'view');
  perform public.seed_role_permission('coach', 'atleti',      'view');
  perform public.seed_role_permission('coach', 'percentuali', 'view');
  perform public.seed_role_permission('coach', 'archivio',    'view');
  perform public.seed_role_permission('coach', 'squadre',     'none');
  perform public.seed_role_permission('coach', 'utenti',      'none');
  perform public.seed_role_permission('coach', 'ruoli',       'none');

  -- Giocatore: segna se stesso (la RLS lo confina), vede le sue date e
  -- le sue percentuali. Archivio no: contiene i numeri di tutti.
  perform public.seed_role_permission('athlete', 'appello',     'edit');
  perform public.seed_role_permission('athlete', 'calendario',  'view');
  perform public.seed_role_permission('athlete', 'atleti',      'view');
  perform public.seed_role_permission('athlete', 'percentuali', 'view');
  perform public.seed_role_permission('athlete', 'archivio',    'none');
  perform public.seed_role_permission('athlete', 'squadre',     'none');
  perform public.seed_role_permission('athlete', 'utenti',      'none');
  perform public.seed_role_permission('athlete', 'ruoli',       'none');
end $$;

-- Ogni account esistente prende il ruolo che corrisponde al suo vecchio role.
update public.profiles p
   set role_id = r.id
  from public.roles r
 where p.role_id is null
   and r.key = case p.role when 'admin' then 'admin'
                           when 'athlete' then 'athlete'
                           else 'coach' end;


-- ---------------------------------------------------------------------
-- 3. ALLINEAMENTO profiles.role
-- role resta la colonna che leggono is_admin() e is_staff(): qui la si
-- tiene in pari con il tipo base del ruolo assegnato.
-- ---------------------------------------------------------------------

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_base text;
begin
  if new.role_id is null then return new; end if;

  select r.base into v_base from public.roles r where r.id = new.role_id;
  if v_base is null then
    raise exception 'Ruolo inesistente.';
  end if;

  new.role := case v_base
                when 'admin'   then 'admin'
                when 'athlete' then 'athlete'
                else 'user'
              end;
  return new;
end;
$$;

drop trigger if exists profiles_sync_role on public.profiles;
create trigger profiles_sync_role
  before insert or update of role_id on public.profiles
  for each row execute function public.sync_profile_role();

/* Un ruolo che cambia tipo base deve trascinarsi dietro i profili:
   senza, un "TM" promosso da staff ad admin lascerebbe role = 'user'
   e la RLS continuerebbe a trattarlo da allenatore. */
create or replace function public.sync_role_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base is distinct from old.base then
    update public.profiles
       set role = case new.base
                    when 'admin'   then 'admin'
                    when 'athlete' then 'athlete'
                    else 'user'
                  end
     where role_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists roles_sync_members on public.roles;
create trigger roles_sync_members
  after update of base on public.roles
  for each row execute function public.sync_role_members();

-- Un solo ruolo predefinito alla volta: segnarne uno spegne il precedente.
create or replace function public.single_default_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default then
    update public.roles set is_default = false
     where is_default and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists roles_single_default on public.roles;
create trigger roles_single_default
  after insert or update of is_default on public.roles
  for each row when (new.is_default)
  execute function public.single_default_role();

-- Chi si registra da solo prende il ruolo predefinito, sempre in attesa.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    (select r.id from public.roles r where r.is_default order by r.sort limit 1)
  );
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. LETTURA DEI PERMESSI
-- security definer: leggono roles e role_permissions scavalcando la RLS,
-- cosi' le policy possono chiamarle senza ricorsione.
-- ---------------------------------------------------------------------

create or replace function public.perm_level(p_section text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when public.is_admin() then 'edit'
    else coalesce(
      (select rp.level
         from public.role_permissions rp
         join public.profiles p on p.role_id = rp.role_id
        where p.id = auth.uid()
          and p.status = 'active'
          and rp.section = p_section),
      'none'
    )
  end;
$$;

create or replace function public.can_view(p_section text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select public.perm_level(p_section) in ('view', 'edit'); $$;

create or replace function public.can_edit(p_section text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select public.perm_level(p_section) = 'edit'; $$;

/* La matrice dell'utente collegato, in un colpo solo: la usa il
   frontend per costruire il menu e per disabilitare i comandi. */
create or replace function public.my_permissions()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when public.is_admin() then
      (select jsonb_object_agg(s, 'edit')
         from unnest(public.permission_sections()) s)
    else coalesce(
      (select jsonb_object_agg(rp.section, rp.level)
         from public.role_permissions rp
         join public.profiles p on p.role_id = rp.role_id
        where p.id = auth.uid() and p.status = 'active'),
      '{}'::jsonb
    )
  end;
$$;


-- ---------------------------------------------------------------------
-- 5. GUARDIE ANTI-SCALATA
-- Delegare "Utenti" o "Ruoli" a un non-admin e' comodo, ma non deve
-- diventare la strada per farsi admin da soli.
-- ---------------------------------------------------------------------

create or replace function public.guard_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_base text;
  v_new_base text;
begin
  -- Nessuna sessione utente (service key dalle server action, trigger
  -- interni): il controllo l'ha gia' fatto l'applicazione.
  if auth.uid() is null or public.is_admin() then return new; end if;

  select r.base into v_old_base from public.roles r where r.id = old.role_id;
  select r.base into v_new_base from public.roles r where r.id = new.role_id;

  if coalesce(v_old_base, old.role) = 'admin' or coalesce(v_new_base, '') = 'admin' then
    raise exception 'Solo un amministratore puo'' toccare gli account di amministrazione.';
  end if;

  if new.id = auth.uid() and new.role_id is distinct from old.role_id then
    raise exception 'Non puoi cambiare ruolo al tuo stesso account.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_change on public.profiles;
create trigger profiles_guard_change
  before update on public.profiles
  for each row execute function public.guard_profile_change();

create or replace function public.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'I ruoli di sistema non si eliminano.';
    end if;
    return old;
  end if;

  if new.base = 'admin' and auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo un amministratore puo'' creare ruoli di amministrazione.';
  end if;

  if tg_op = 'UPDATE' and old.is_system
     and (new.base is distinct from old.base or new.key is distinct from old.key) then
    raise exception 'Tipo e chiave di un ruolo di sistema non si cambiano.';
  end if;

  return new;
end;
$$;

drop trigger if exists roles_guard_change on public.roles;
create trigger roles_guard_change
  before insert or update or delete on public.roles
  for each row execute function public.guard_role_change();

/* Nessuno, a parte un admin vero, alza i permessi del ruolo che sta
   indossando: altrimenti "Ruoli: modifica" varrebbe "tutto". */
create or replace function public.guard_role_permission_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_role uuid;
begin
  if auth.uid() is null or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select p.role_id into v_role from public.profiles p where p.id = auth.uid();

  if v_role = coalesce(new.role_id, old.role_id) then
    raise exception 'Non puoi cambiare i permessi del tuo stesso ruolo.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard
  before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_permission_change();


-- ---------------------------------------------------------------------
-- 6. RLS SULLE NUOVE TABELLE
-- I nomi dei ruoli li leggono tutti (servono al profilo e agli elenchi);
-- la matrice la legge chi ha la sezione Ruoli.
-- ---------------------------------------------------------------------

alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "roles: lettura utenti attivi" on public.roles;
create policy "roles: lettura utenti attivi"
  on public.roles for select
  using (public.is_active());

drop policy if exists "roles: scrittura con permesso" on public.roles;
create policy "roles: scrittura con permesso"
  on public.roles for all
  using (public.can_edit('ruoli'))
  with check (public.can_edit('ruoli'));

drop policy if exists "role_permissions: lettura con permesso" on public.role_permissions;
create policy "role_permissions: lettura con permesso"
  on public.role_permissions for select
  using (public.can_view('ruoli'));

drop policy if exists "role_permissions: scrittura con permesso" on public.role_permissions;
create policy "role_permissions: scrittura con permesso"
  on public.role_permissions for all
  using (public.can_edit('ruoli'))
  with check (public.can_edit('ruoli'));


-- ---------------------------------------------------------------------
-- 7. LE POLICY ESISTENTI PASSANO ALLA MATRICE
-- Dove c'era is_admin() ora c'e' can_edit('<sezione>'). Per l'admin non
-- cambia niente (perm_level gli risponde sempre 'edit'), per gli altri
-- e' la matrice a decidere.
-- ---------------------------------------------------------------------

-- profiles ----------------------------------------------------------
drop policy if exists "profiles: admin legge tutti"   on public.profiles;
drop policy if exists "profiles: admin modifica tutti" on public.profiles;

drop policy if exists "profiles: lettura con permesso utenti" on public.profiles;
create policy "profiles: lettura con permesso utenti"
  on public.profiles for select
  using (public.can_view('utenti'));

drop policy if exists "profiles: scrittura con permesso utenti" on public.profiles;
create policy "profiles: scrittura con permesso utenti"
  on public.profiles for update
  using (public.can_edit('utenti'))
  with check (public.can_edit('utenti'));

-- athletes ----------------------------------------------------------
-- La lettura resta aperta a ogni utente attivo: il tabellone dell'appello
-- ha bisogno della rosa anche per chi non vede la sezione Atleti.
drop policy if exists "athletes: scrittura admin" on public.athletes;
drop policy if exists "athletes: scrittura con permesso" on public.athletes;
create policy "athletes: scrittura con permesso"
  on public.athletes for all
  using (public.can_edit('atleti'))
  with check (public.can_edit('atleti'));

-- events ------------------------------------------------------------
drop policy if exists "events: scrittura admin" on public.events;
drop policy if exists "events: scrittura con permesso" on public.events;
create policy "events: scrittura con permesso"
  on public.events for all
  using (public.can_edit('calendario'))
  with check (public.can_edit('calendario'));

-- teams -------------------------------------------------------------
drop policy if exists "teams: scrittura admin" on public.teams;
drop policy if exists "teams: scrittura con permesso" on public.teams;
create policy "teams: scrittura con permesso"
  on public.teams for all
  using (public.can_edit('squadre'))
  with check (public.can_edit('squadre'));

drop policy if exists "team_members: scrittura admin" on public.team_members;
drop policy if exists "team_members: scrittura con permesso" on public.team_members;
create policy "team_members: scrittura con permesso"
  on public.team_members for all
  using (public.can_edit('squadre'))
  with check (public.can_edit('squadre'));

-- archives ----------------------------------------------------------
drop policy if exists "archives: lettura utenti attivi" on public.archives;
drop policy if exists "archives: lettura staff"         on public.archives;
drop policy if exists "archives: lettura con permesso" on public.archives;
create policy "archives: lettura con permesso"
  on public.archives for select
  using (public.can_view('archivio'));

drop policy if exists "archives: scrittura admin" on public.archives;
drop policy if exists "archives: scrittura con permesso" on public.archives;
create policy "archives: scrittura con permesso"
  on public.archives for all
  using (public.can_edit('archivio'))
  with check (public.can_edit('archivio'));

-- absences ----------------------------------------------------------
-- La lettura resta a ogni utente attivo (serve ai contatori e al
-- calendario); la scrittura vuole 'appello' in modifica, e per l'atleta
-- resta comunque confinata alla propria riga.
drop policy if exists "absences: staff scrive" on public.absences;
create policy "absences: staff scrive"
  on public.absences for all
  using (public.is_staff() and public.can_edit('appello'))
  with check (public.is_staff() and public.can_edit('appello'));

drop policy if exists "absences: atleta segna se stesso" on public.absences;
create policy "absences: atleta segna se stesso"
  on public.absences for insert
  with check (public.athlete_can_mark(event_id, athlete_id) and public.can_edit('appello'));

drop policy if exists "absences: atleta modifica la propria" on public.absences;
create policy "absences: atleta modifica la propria"
  on public.absences for update
  using (public.athlete_can_mark(event_id, athlete_id) and public.can_edit('appello'))
  with check (public.athlete_can_mark(event_id, athlete_id) and public.can_edit('appello'));

drop policy if exists "absences: atleta cancella la propria" on public.absences;
create policy "absences: atleta cancella la propria"
  on public.absences for delete
  using (public.athlete_can_mark(event_id, athlete_id) and public.can_edit('appello'));


-- ---------------------------------------------------------------------
-- 8. LE FUNZIONI RPC PASSANO ALLA MATRICE
-- Hanno security definer: senza aggiornarle resterebbero la scorciatoia
-- che aggira tutto quanto sopra.
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
  if not (public.is_staff() and public.can_edit('appello')) then
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

create or replace function public.create_recurring_events(
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
  if not public.can_edit('calendario') then
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

create or replace function public.restore_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit('archivio') then
    raise exception 'non autorizzato';
  end if;

  update public.events set archive_id = null where archive_id = p_id;
  delete from public.archives where id = p_id;
end;
$$;

create or replace function public.purge_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit('archivio') then
    raise exception 'non autorizzato';
  end if;

  delete from public.events where archive_id = p_id;
  delete from public.archives where id = p_id;
end;
$$;

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
-- 9. PERCENTUALI
-- Stessa vista di prima, con in piu' il filtro di sezione: chi non ha
-- 'percentuali' non ne tira fuori righe nemmeno interrogando l'API.
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
  and public.can_view('percentuali')
  and (public.is_staff() or a.id = public.my_athlete_id())
group by a.id, a.first_name, a.last_name, a.nickname, e.type, e.team_id;


-- ---------------------------------------------------------------------
-- 10. VERIFICA
-- ---------------------------------------------------------------------

-- Chi ha quale ruolo:
-- select p.email, r.name, r.base, p.status
--   from public.profiles p left join public.roles r on r.id = p.role_id
--  order by r.sort, p.email;

-- La matrice completa:
-- select r.name, rp.section, rp.level
--   from public.roles r join public.role_permissions rp on rp.role_id = r.id
--  order by r.sort, rp.section;
