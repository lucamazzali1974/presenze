-- =====================================================================
-- Parte 3 — joined_on: allineare la rosa esistente
--
-- PROBLEMA
-- athletes.joined_on ha come default current_date, e fino ad ora l'app
-- non lo impostava mai: ogni giocatore risulta "in rosa" dal giorno in
-- cui e' stato inserito. La vista attendance_stats conta solo gli eventi
--   (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
-- quindi se i giocatori sono stati aggiunti DOPO gli appelli gia' chiusi,
-- la vista non restituisce nessuna riga e /stats resta vuota.
--
-- Da ora il campo si imposta e si modifica da /atleti. Questo script
-- serve solo a sistemare i dati gia' in tabella.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DIAGNOSI — esegui prima questa, per vedere la situazione.
-- ---------------------------------------------------------------------

select
  a.last_name,
  a.first_name,
  a.joined_on,
  (select min((e.starts_at at time zone 'Europe/Rome')::date)
     from public.events e
    where e.closed_at is not null
      and e.archive_id is null)                     as primo_appello_chiuso,
  (select count(*)
     from public.events e
    where e.closed_at is not null
      and e.archive_id is null
      and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on)
                                                    as eventi_conteggiati
from public.athletes a
where a.active
order by a.last_name;


-- ---------------------------------------------------------------------
-- 2. CORREZIONE — porta indietro joined_on al primo appello chiuso,
--    ma solo per chi oggi non conteggia nulla.
--    Se un giocatore e' entrato davvero dopo, NON toccarlo: correggilo
--    a mano da /atleti invece di eseguire questa update.
-- ---------------------------------------------------------------------

update public.athletes a
   set joined_on = least(
         a.joined_on,
         (select min((e.starts_at at time zone 'Europe/Rome')::date)
            from public.events e
           where e.closed_at is not null
             and e.archive_id is null)
       )
 where a.active
   and not exists (
     select 1
       from public.events e
      where e.closed_at is not null
        and e.archive_id is null
        and (e.starts_at at time zone 'Europe/Rome')::date >= a.joined_on
   );


-- ---------------------------------------------------------------------
-- 3. VERIFICA — riesegui la query del punto 1: eventi_conteggiati
--    non deve piu' essere 0.
-- ---------------------------------------------------------------------
