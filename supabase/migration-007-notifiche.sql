-- =====================================================================
-- Parte 7 — notifiche push del mattino
--
-- Ogni telefono che accetta le notifiche registra qui la sua
-- "subscription": un endpoint del servizio push del browser piu' due
-- chiavi. Non e' un dato sensibile ma e' personale, quindi ognuno vede
-- e gestisce solo le proprie. Il job che manda le notifiche gira con la
-- secret key e scavalca la RLS.
--
-- Nessun dato esistente viene toccato: sono due tabelle nuove.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ISCRIZIONI
-- L'endpoint e' unico: se lo stesso telefono si riscrive, si aggiorna
-- la riga invece di crearne una seconda.
-- ---------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: leggo le mie" on public.push_subscriptions;
create policy "push: leggo le mie"
  on public.push_subscriptions for select
  using (profile_id = auth.uid());

drop policy if exists "push: registro le mie" on public.push_subscriptions;
create policy "push: registro le mie"
  on public.push_subscriptions for insert
  with check (profile_id = auth.uid());

drop policy if exists "push: aggiorno le mie" on public.push_subscriptions;
create policy "push: aggiorno le mie"
  on public.push_subscriptions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "push: cancello le mie" on public.push_subscriptions;
create policy "push: cancello le mie"
  on public.push_subscriptions for delete
  using (profile_id = auth.uid());


-- ---------------------------------------------------------------------
-- 2. REGISTRO DEGLI INVII
-- Una riga per evento e per giorno. Serve a non mandare due promemoria
-- se il job parte due volte: si inserisce prima di spedire, e il
-- conflitto sulla chiave primaria e' il segnale di "gia' fatto".
-- ---------------------------------------------------------------------

create table if not exists public.reminder_log (
  event_id uuid not null references public.events (id) on delete cascade,
  sent_on  date not null,
  sent_at  timestamptz not null default now(),
  sent_to  int not null default 0,
  primary key (event_id, sent_on)
);

alter table public.reminder_log enable row level security;

-- Ci scrive solo il job con la secret key: nessuna policy, nessun accesso
-- dall'app. La RLS attiva senza policy nega tutto, che e' cio' che serve.
