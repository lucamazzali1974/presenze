-- =====================================================================
-- Parte 15 — lo staff vede solo le sue squadre
--
-- Fino alla 014 lo staff lavorava su tutta l'installazione: un
-- allenatore degli Spartani U14 vedeva anche le altre squadre, e con
-- piu' club sulla stessa app anche gli altri club. Da qui:
--
--   * admin            vede e fa tutto, sempre
--   * staff            vede solo le squadre che gli sono assegnate
--                      (tabella staff_teams, la assegna l'admin)
--   * giocatore        vede solo le squadre in cui gioca
--   * eventi senza squadra ("tutta la societa'") restano visibili a tutti
--
-- Il filtro sta nella RLS, non nell'app: vale per ogni pagina, vista e
-- RPC, e chi prova a leggere una squadra non sua dal client non ottiene
-- niente.
--
-- Per non cambiare niente a chi c'e' gia', lo staff esistente viene
-- assegnato a TUTTE le squadre esistenti. Poi l'admin toglie quelle che
-- non servono, utente per utente. Chi viene creato da qui in poi parte
-- senza squadre.
--
-- Eseguire nel SQL Editor di Supabase, dopo la 014. Idempotente.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA TABELLA: quale membro dello staff segue quale squadra
-- ---------------------------------------------------------------------

create table if not exists public.staff_teams (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  team_id    uuid not null references public.teams    (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, team_id)
);

create index if not exists staff_teams_team_idx on public.staff_teams (team_id);

-- Chi crea una squadra o un atleta deve continuare a vederli anche
-- prima che gli siano assegnati: serve sapere chi li ha creati.
alter table public.teams    add column if not exists created_by uuid
  references public.profiles (id) on delete set null default auth.uid();
alter table public.athletes add column if not exists created_by uuid
  references public.profiles (id) on delete set null default auth.uid();


-- ---------------------------------------------------------------------
-- 2. LO STAFF DI OGGI SEGUE TUTTE LE SQUADRE DI OGGI
-- Solo alla prima esecuzione: se staff_teams ha gia' righe, l'admin ha
-- gia' fatto le sue scelte e non vanno ricoperte.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.staff_teams) then
    insert into public.staff_teams (profile_id, team_id)
    select p.id, t.id
      from public.profiles p
     cross join public.teams t
     where p.role = 'user';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. LE REGOLE DI VISIBILITA'
-- security definer: leggono le tabelle senza passare dalla RLS, cosi'
-- le policy che le usano non si richiamano a vicenda.
-- ---------------------------------------------------------------------

/* Una squadra: null = evento di tutta la societa', lo vede chiunque. */
create or replace function public.can_see_team(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not public.is_active() then false
    when p_team_id is null      then true
    when public.is_admin()      then true
    when public.is_staff()      then exists (
      select 1 from public.staff_teams st
       where st.profile_id = auth.uid() and st.team_id = p_team_id
    )
    else exists (
      select 1 from public.team_members tm
       where tm.team_id = p_team_id and tm.athlete_id = public.my_athlete_id()
    )
  end;
$$;

/* Un evento: lo si vede se si vede la sua squadra. */
create or replace function public.can_see_event(p_event_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id and public.can_see_team(e.team_id)
  );
$$;

/*
 * Un atleta: se gioca in almeno una squadra visibile. Senza squadra lo
 * vede l'admin, e chi l'ha appena creato (finche' non lo mette in rosa).
 * Il giocatore vede sempre la propria scheda.
 */
create or replace function public.can_see_athlete(p_athlete_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_active() and (
       public.is_admin()
    or p_athlete_id = public.my_athlete_id()
    or exists (
         select 1 from public.team_members tm
          where tm.athlete_id = p_athlete_id
            and public.can_see_team(tm.team_id)
       )
    or (public.is_staff() and exists (
         select 1 from public.athletes a
          where a.id = p_athlete_id
            and a.created_by = auth.uid()
            and not exists (select 1 from public.team_members tm
                             where tm.athlete_id = a.id)
       ))
  );
$$;

/*
 * Un account, nella pagina Utenti: se stesso; i giocatori delle proprie
 * squadre; lo staff che condivide almeno una squadra. Le registrazioni
 * in attesa (nessuna squadra ancora) le vede e le approva l'admin.
 */
create or replace function public.can_see_profile(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select p_profile_id = auth.uid()
      or public.is_admin()
      or (public.can_view('utenti') and (
            exists (
              select 1 from public.athletes a
               where a.profile_id = p_profile_id
                 and public.can_see_athlete(a.id)
            )
         or exists (
              select 1
                from public.staff_teams mine
                join public.staff_teams theirs on theirs.team_id = mine.team_id
               where mine.profile_id = auth.uid()
                 and theirs.profile_id = p_profile_id
            )
         ));
$$;


-- ---------------------------------------------------------------------
-- 4. STAFF_TEAMS: la assegna solo l'admin
-- Altrimenti chi ha "Utenti: modifica" si aprirebbe da solo le squadre
-- degli altri.
-- ---------------------------------------------------------------------

alter table public.staff_teams enable row level security;

drop policy if exists "staff_teams: lettura" on public.staff_teams;
create policy "staff_teams: lettura"
  on public.staff_teams for select
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or (public.can_view('utenti') and public.can_see_team(team_id))
  );

drop policy if exists "staff_teams: scrittura admin" on public.staff_teams;
create policy "staff_teams: scrittura admin"
  on public.staff_teams for all
  using (public.is_admin())
  with check (public.is_admin());

/* Chi crea una squadra (staff con "Squadre: modifica") la segue subito. */
create or replace function public.assign_new_team_to_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.is_staff() and not public.is_admin() then
    insert into public.staff_teams (profile_id, team_id)
    values (auth.uid(), new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists teams_assign_creator on public.teams;
create trigger teams_assign_creator
  after insert on public.teams
  for each row execute function public.assign_new_team_to_creator();


-- ---------------------------------------------------------------------
-- 5. LETTURA: ogni tabella passa dalla squadra
-- ---------------------------------------------------------------------

-- teams -------------------------------------------------------------
drop policy if exists "teams: lettura utenti attivi" on public.teams;
drop policy if exists "teams: lettura per squadra"   on public.teams;
create policy "teams: lettura per squadra"
  on public.teams for select
  using (public.can_see_team(id) or (public.is_active() and created_by = auth.uid()));

-- team_members ------------------------------------------------------
drop policy if exists "team_members: lettura utenti attivi" on public.team_members;
drop policy if exists "team_members: lettura per squadra"   on public.team_members;
create policy "team_members: lettura per squadra"
  on public.team_members for select
  using (public.can_see_team(team_id));

-- athletes ----------------------------------------------------------
drop policy if exists "athletes: lettura utenti attivi" on public.athletes;
drop policy if exists "athletes: lettura per squadra"   on public.athletes;
create policy "athletes: lettura per squadra"
  on public.athletes for select
  using (
    public.can_see_athlete(id)
    -- Ripetuto qui e non solo nella funzione: subito dopo l'insert la
    -- funzione non vede ancora la riga nuova, e "crea atleta" fallirebbe.
    or (public.is_staff() and created_by = auth.uid()
        and not exists (select 1 from public.team_members tm
                         where tm.athlete_id = athletes.id))
  );

-- events ------------------------------------------------------------
drop policy if exists "events: lettura utenti attivi" on public.events;
drop policy if exists "events: lettura per squadra"   on public.events;
create policy "events: lettura per squadra"
  on public.events for select
  using (public.can_see_team(team_id));

-- absences ----------------------------------------------------------
drop policy if exists "absences: lettura utenti attivi" on public.absences;
drop policy if exists "absences: lettura per squadra"   on public.absences;
create policy "absences: lettura per squadra"
  on public.absences for select
  using (public.can_see_event(event_id));

-- formazioni, convocati, incontri, marcature ------------------------
drop policy if exists "lineups: lettura utenti attivi" on public.lineups;
drop policy if exists "lineups: lettura per squadra"   on public.lineups;
create policy "lineups: lettura per squadra"
  on public.lineups for select
  using (public.can_see_event(event_id));

drop policy if exists "lineup_members: lettura utenti attivi" on public.lineup_members;
drop policy if exists "lineup_members: lettura per squadra"   on public.lineup_members;
create policy "lineup_members: lettura per squadra"
  on public.lineup_members for select
  using (public.can_see_event(event_id));

drop policy if exists "games: lettura utenti attivi" on public.games;
drop policy if exists "games: lettura per squadra"   on public.games;
create policy "games: lettura per squadra"
  on public.games for select
  using (public.can_see_event(event_id));

drop policy if exists "scores: lettura utenti attivi" on public.scores;
drop policy if exists "scores: lettura per squadra"   on public.scores;
create policy "scores: lettura per squadra"
  on public.scores for select
  using (exists (
    select 1 from public.lineups l
     where l.id = lineup_id and public.can_see_event(l.event_id)
  ));

-- giorni previsti ---------------------------------------------------
drop policy if exists "athlete_schedules: lettura utenti attivi" on public.athlete_schedules;
drop policy if exists "athlete_schedules: lettura per squadra"   on public.athlete_schedules;
create policy "athlete_schedules: lettura per squadra"
  on public.athlete_schedules for select
  using (public.can_see_athlete(athlete_id));

-- profiles ----------------------------------------------------------
drop policy if exists "profiles: lettura con permesso utenti" on public.profiles;
create policy "profiles: lettura con permesso utenti"
  on public.profiles for select
  using (public.can_see_profile(id));


-- ---------------------------------------------------------------------
-- 6. SCRITTURA: il permesso di sezione resta, ci si aggiunge la squadra
-- Per l'admin can_see_* risponde sempre si': per lui non cambia niente.
-- ---------------------------------------------------------------------

-- profiles ----------------------------------------------------------
drop policy if exists "profiles: scrittura con permesso utenti" on public.profiles;
create policy "profiles: scrittura con permesso utenti"
  on public.profiles for update
  using (public.can_edit('utenti') and public.can_see_profile(id))
  with check (public.can_edit('utenti') and public.can_see_profile(id));

-- teams: crearne una si puo' col permesso; toccarne una solo se e' tua.
drop policy if exists "teams: scrittura con permesso" on public.teams;
drop policy if exists "teams: creazione con permesso" on public.teams;
drop policy if exists "teams: modifica per squadra"   on public.teams;
drop policy if exists "teams: eliminazione per squadra" on public.teams;
create policy "teams: creazione con permesso"
  on public.teams for insert
  with check (public.can_edit('squadre'));
create policy "teams: modifica per squadra"
  on public.teams for update
  using (public.can_edit('squadre') and public.can_see_team(id))
  with check (public.can_edit('squadre') and public.can_see_team(id));
create policy "teams: eliminazione per squadra"
  on public.teams for delete
  using (public.can_edit('squadre') and public.can_see_team(id));

drop policy if exists "team_members: scrittura con permesso" on public.team_members;
create policy "team_members: scrittura con permesso"
  on public.team_members for all
  using (public.can_edit('squadre') and public.can_see_team(team_id))
  with check (public.can_edit('squadre') and public.can_see_team(team_id));

-- athletes: crearne uno si puo'; modificarlo solo se lo vedi.
drop policy if exists "athletes: scrittura con permesso" on public.athletes;
drop policy if exists "athletes: creazione con permesso" on public.athletes;
drop policy if exists "athletes: modifica per squadra"   on public.athletes;
drop policy if exists "athletes: eliminazione per squadra" on public.athletes;
create policy "athletes: creazione con permesso"
  on public.athletes for insert
  with check (public.can_edit('atleti'));
create policy "athletes: modifica per squadra"
  on public.athletes for update
  using (public.can_edit('atleti') and public.can_see_athlete(id))
  with check (public.can_edit('atleti') and public.can_see_athlete(id));
create policy "athletes: eliminazione per squadra"
  on public.athletes for delete
  using (public.can_edit('atleti') and public.can_see_athlete(id));

drop policy if exists "athlete_schedules: scrittura con permesso" on public.athlete_schedules;
create policy "athlete_schedules: scrittura con permesso"
  on public.athlete_schedules for all
  using (public.can_edit('atleti') and public.can_see_athlete(athlete_id))
  with check (public.can_edit('atleti') and public.can_see_athlete(athlete_id));

-- events: gli eventi "di tutta la societa'" li crea solo l'admin, se no
-- un allenatore scriverebbe nel calendario di tutti i club.
drop policy if exists "events: scrittura con permesso" on public.events;
create policy "events: scrittura con permesso"
  on public.events for all
  using (
    public.can_edit('calendario')
    and (public.is_admin() or (team_id is not null and public.can_see_team(team_id)))
  )
  with check (
    public.can_edit('calendario')
    and (public.is_admin() or (team_id is not null and public.can_see_team(team_id)))
  );

-- absences ----------------------------------------------------------
drop policy if exists "absences: staff scrive" on public.absences;
create policy "absences: staff scrive"
  on public.absences for all
  using (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id))
  with check (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id));

-- formazioni, convocati, incontri, marcature ------------------------
drop policy if exists "lineups: scrittura con permesso" on public.lineups;
create policy "lineups: scrittura con permesso"
  on public.lineups for all
  using (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id))
  with check (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id));

drop policy if exists "lineup_members: scrittura con permesso" on public.lineup_members;
create policy "lineup_members: scrittura con permesso"
  on public.lineup_members for all
  using (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id))
  with check (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id));

drop policy if exists "games: scrittura con permesso" on public.games;
create policy "games: scrittura con permesso"
  on public.games for all
  using (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id))
  with check (public.is_staff() and public.can_edit('appello') and public.can_see_event(event_id));

drop policy if exists "scores: scrittura con permesso" on public.scores;
create policy "scores: scrittura con permesso"
  on public.scores for all
  using (
    public.is_staff() and public.can_edit('appello')
    and exists (select 1 from public.lineups l
                 where l.id = lineup_id and public.can_see_event(l.event_id))
  )
  with check (
    public.is_staff() and public.can_edit('appello')
    and exists (select 1 from public.games g
                 where g.id = game_id and public.can_see_event(g.event_id))
  );


-- ---------------------------------------------------------------------
-- 7. LE RPC: security definer, quindi il controllo va ripetuto dentro
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
  if not (public.is_staff() and public.can_edit('appello')
          and public.can_see_event(p_event_id)) then
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

  if not public.is_admin()
     and (p_team_id is null or not public.can_see_team(p_team_id)) then
    raise exception 'Scegli una delle tue squadre: gli eventi di tutta la società li crea l''amministratore.';
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
  if not (public.is_staff() and public.can_edit('appello')
          and public.can_see_event(p_event_id)) then
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

/*
 * Gli archivi tagliano per periodo TUTTI gli eventi, di tutte le
 * squadre: archiviare, ripristinare ed eliminare un archivio diventano
 * operazioni da admin. Lo staff continua a consultarli, e l'app gli
 * mostra solo i giocatori delle sue squadre.
 */
create or replace function public.restore_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un amministratore può ripristinare un archivio.';
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
  if not public.is_admin() then
    raise exception 'Solo un amministratore può eliminare un archivio.';
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
  if not public.is_admin() then
    raise exception 'Solo un amministratore può archiviare: l''archivio taglia gli eventi di tutte le squadre.';
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
-- 8. PERMESSI SUGLI OGGETTI NUOVI (vedi la nota nella 012)
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on public.staff_teams to authenticated;
    grant execute on function public.can_see_team(uuid),
                              public.can_see_event(uuid),
                              public.can_see_athlete(uuid),
                              public.can_see_profile(uuid) to authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.staff_teams to service_role;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 9. VERIFICA
-- ---------------------------------------------------------------------

-- Chi segue cosa:
-- select p.full_name, p.email, t.name as squadra
--   from public.staff_teams st
--   join public.profiles p on p.id = st.profile_id
--   join public.teams    t on t.id = st.team_id
--  order by p.full_name, t.name;
--
-- Staff senza nessuna squadra (vede solo gli eventi di tutta la societa'):
-- select p.full_name, p.email from public.profiles p
--  where p.role = 'user'
--    and not exists (select 1 from public.staff_teams st where st.profile_id = p.id);
