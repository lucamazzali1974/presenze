-- =====================================================================
-- Parte 9 — indirizzo del campo
--
-- location resta il nome del campo ("Campo GEAS"), address e' la via
-- che si passa a Google Maps. Sono separati perche' servono a due cose
-- diverse: uno si legge, l'altro si naviga.
--
-- Una sola colonna nuova, nulla su tutte le righe esistenti.
-- =====================================================================

alter table public.events
  add column if not exists address text;

-- Verifica
-- select title, location, address from public.events where type = 'match';
