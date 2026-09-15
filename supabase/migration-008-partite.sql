-- =====================================================================
-- Parte 8 — dati della partita, e assegnazione degli eventi esistenti
--
-- Due colonne nuove su events, usate solo dalle partite:
--   opponent  nome della squadra avversaria
--   meet_at   ora di ritrovo (prima del fischio d'inizio)
-- Restano nulle sugli allenamenti e su tutto cio' che c'e' gia'.
--
-- Nessun dato viene cancellato. L'unica modifica a righe esistenti e'
-- il punto 2, che assegna gli allenamenti a una squadra.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. COLONNE NUOVE
-- meet_at e' un timestamptz e non una semplice ora: cosi' si formatta
-- con gli stessi strumenti di starts_at e non si perde il fuso.
-- ---------------------------------------------------------------------

alter table public.events
  add column if not exists opponent text,
  add column if not exists meet_at  timestamptz;


-- ---------------------------------------------------------------------
-- 2. GLI ALLENAMENTI ESISTENTI VANNO A "Spartani U14"
-- Tocca solo gli eventi che oggi non hanno squadra. Se il nome non
-- combacia esattamente non aggiorna niente: controlla prima il punto 4.
-- ---------------------------------------------------------------------

update public.events e
   set team_id = t.id
  from public.teams t
 where t.name = 'Spartani U14'
   and e.team_id is null
   and e.type = 'training';


-- ---------------------------------------------------------------------
-- 3. LE PARTITE (facoltativo)
-- Stessa cosa per le partite gia' in calendario. Eseguila solo se
-- anche quelle sono degli Spartani U14: se un domani ci giocano piu'
-- squadre, assegnale a mano dal Calendario.
-- ---------------------------------------------------------------------

-- update public.events e
--    set team_id = t.id
--   from public.teams t
--  where t.name = 'Spartani U14'
--    and e.team_id is null
--    and e.type = 'match';


-- ---------------------------------------------------------------------
-- 4. VERIFICA — prima e dopo
-- ---------------------------------------------------------------------

select
  coalesce(t.name, '(senza squadra)') as squadra,
  e.type,
  count(*) as eventi
from public.events e
left join public.teams t on t.id = e.team_id
where e.archive_id is null
group by 1, 2
order by 1, 2;
