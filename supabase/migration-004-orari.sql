-- =====================================================================
-- Parte 4 — controllo degli orari salvati dall'app
--
-- PROBLEMA (corretto nel codice, questo file serve solo a sistemare i
-- dati gia' scritti)
-- createEvent e updateEvent mandavano a Postgres la stringa nuda
-- '2026-09-15T19:00:00', senza zona. La colonna starts_at e' timestamptz
-- e Postgres interpreta un timestamp senza zona con il fuso della
-- sessione, che su Supabase e' UTC: l'evento finiva alle 19:00 UTC,
-- cioe' alle 21:00 italiane (20:00 in inverno).
--
-- Non riguarda le serie ricorrenti: quelle le genera
-- create_recurring_events, che fa gia' "at time zone 'Europe/Rome'".
-- Riguarda le date singole e QUALSIASI evento modificato dalla
-- schermata Calendario prima di questa correzione.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. AUDIT — che ora vedi nell'app, evento per evento.
--    Controlla la colonna ora_italiana: e' quella che l'app mostra.
-- ---------------------------------------------------------------------

select
  e.id,
  e.type,
  coalesce(e.title, '(senza titolo)')                     as titolo,
  e.location,
  (e.starts_at at time zone 'Europe/Rome')                as ora_italiana,
  case when e.series_id is null then 'singola' else 'ricorrente' end as origine,
  case when e.closed_at is null then 'aperto' else 'chiuso' end      as appello
from public.events e
where e.archive_id is null
order by e.starts_at desc;


-- ---------------------------------------------------------------------
-- 2. CORREZIONE MIRATA — solo se un evento e' avanti di 2 ore (1 in
--    inverno). Sostituisci l'id e l'orario giusto, poi esegui.
--    Sposta un solo evento: e' il modo piu' sicuro.
--
--    In alternativa, e piu' semplice: apri Calendario > Modifica,
--    reimposta l'ora e salva. Ora il salvataggio scrive il fuso giusto.
-- ---------------------------------------------------------------------

-- update public.events
--    set starts_at = ('2026-09-15' + time '19:00') at time zone 'Europe/Rome'
--  where id = 'INCOLLA-QUI-L-ID';


-- ---------------------------------------------------------------------
-- 3. CORREZIONE IN BLOCCO — SOLO per le date singole mai corrette a
--    mano, e SOLO se l'audit conferma che sono tutte avanti.
--    Riporta l'orario al valore che era stato digitato nel form.
--    Leggi prima il punto 1: se anche una sola e' gia' giusta, questa
--    query la sposta indietro per sbaglio. In dubbio, non eseguirla.
-- ---------------------------------------------------------------------

-- update public.events e
--    set starts_at = (
--          (e.starts_at at time zone 'UTC')::date
--          + (e.starts_at at time zone 'UTC')::time
--        ) at time zone 'Europe/Rome'
--  where e.series_id is null
--    and e.archive_id is null;
