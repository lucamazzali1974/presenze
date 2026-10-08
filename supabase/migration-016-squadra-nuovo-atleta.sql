-- =====================================================================
-- Parte 16 — la squadra si sceglie gia' quando si crea il giocatore
--
-- Il form "Aggiungi giocatore" ora ha anche la squadra. Mettere in rosa
-- pero' e' una scrittura su team_members, che fino a qui voleva il
-- permesso "Squadre: modifica": chi ha solo "Atleti: modifica" avrebbe
-- creato il giocatore e poi visto fallire l'assegnazione.
--
-- Da qui chi puo' modificare gli atleti puo' anche AGGIUNGERLI a una
-- squadra, purche' sia una squadra che vede (per lo staff: una delle
-- sue, vedi la 015). Togliere giocatori dalle squadre e gestire le
-- squadre resta a "Squadre: modifica".
--
-- Eseguire nel SQL Editor di Supabase, dopo la 015. Idempotente.
-- =====================================================================

drop policy if exists "team_members: inserimento con permesso atleti" on public.team_members;
create policy "team_members: inserimento con permesso atleti"
  on public.team_members for insert
  with check (public.can_edit('atleti') and public.can_see_team(team_id));
