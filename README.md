# Presenze

Appello di allenamenti e partite. Next.js 15 + Supabase.

## Come funziona

Si salvano **solo le assenze**. Chi non ha una riga in `absences` risulta
presente. Il toggle dell'appello e' quindi un INSERT o un DELETE di una riga,
e non serve generare nulla quando si crea un evento.

Un evento entra nelle percentuali solo quando qualcuno **chiude l'appello**
(`closed_at`). Serve a distinguere "erano tutti presenti" da "nessuno ha
compilato".

Gli **atleti** sono anagrafica, separati dagli **utenti** che fanno login.
Chi accede e' un allenatore o dirigente e compila l'appello di tutta la rosa.

## Avvio

1. Crea un progetto su supabase.com (piano Free, regione Frankfurt).
2. SQL Editor, incolla `supabase/schema.sql`, esegui tutto in una volta sola.
   Se il database esiste gia' da una versione precedente, esegui invece solo
   `supabase/migration-002-archivi.sql`.
3. `cp .env.local.example .env.local` e compila i valori (vedi sotto).
4. `npm install && npm run dev`
5. Registrati da `/register`, poi in SQL Editor:

   ```sql
   update public.profiles
      set role = 'admin', status = 'active'
    where email = 'tua@email.it'
   returning email, role, status;
   ```

   Se non torna nessuna riga, l'email non corrisponde a quella usata.

6. Da `/atleti` inserisci la rosa, da `/admin/events` il calendario.

Se il login dice "Email o password non corretti" subito dopo la
registrazione, e' la conferma email: Authentication > Sign In / Providers >
Email > spegni **Confirm email**. Per sbloccare un utente gia' creato:

```sql
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
```

## Variabili d'ambiente

| Variabile | Dove si trova | Obbligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings > Data API | si |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings > API Keys | si |
| `SUPABASE_SECRET_KEY` | Settings > API Keys, sezione Secret keys | no |

La secret key serve solo a creare, eliminare e cambiare password agli utenti
da `/admin/users`. Bypassa la RLS: niente prefisso `NEXT_PUBLIC_`, mai in un
commit. Senza, l'app funziona e gli accessi si approvano comunque, ma non si
creano dall'interno.

## Pagine

| Percorso | Chi | Cosa |
|---|---|---|
| `/` | tutti | appello del prossimo allenamento e della prossima partita |
| `/atleti` | tutti | rosa completa; form e modifiche solo per admin |
| `/stats` | tutti | percentuali per giocatore, allenamenti e partite separati |
| `/events/[id]` | tutti | appello di un evento specifico, anche passato |
| `/admin/events` | admin | calendario, date singole e ricorrenti |
| `/archivio` | tutti | periodi archiviati; ripristino ed eliminazione per gli admin |
| `/archivio/[id]` | tutti | percentuali fotografate e calendario del periodo, con CSV |
| `/admin/users` | admin | accessi: creazione, approvazione, blocco, modifica, eliminazione |

## Deploy

Push su GitHub, import su Vercel, le tre variabili d'ambiente su Production,
Preview e Development. Poi in Supabase, Authentication > URL Configuration:
Site URL sul dominio Vercel, e nei Redirect URLs
`https://tuo-dominio.vercel.app/**` e `http://localhost:3000/**`.

Il workflow in `.github/workflows/keepalive.yml` evita che il progetto
Supabase free vada in pausa dopo 7 giorni di inattivita': aggiungi i secret
`SUPABASE_URL` e `SUPABASE_ANON_KEY` nelle impostazioni del repository (per
il secondo vale anche la publishable key).

## Archivi

Archiviare un periodo (dalla pagina Percentuali, solo admin) fa tre cose:
fotografa le percentuali di quel periodo in `archives.snapshot`, sposta gli
eventi compresi sotto `events.archive_id`, e cosi' li toglie dal calendario e
dalle percentuali correnti. Da `/archivio` chiunque puo' consultare gli
archivi e scaricarne i CSV; un admin puo' **ripristinare** (gli eventi tornano
correnti, l'archivio sparisce) oppure **eliminare per sempre** (spariscono
eventi e presenze del periodo).

Le percentuali dell'archivio sono una fotografia: restano quelle del momento
in cui hai archiviato, anche se poi modifichi la rosa.

## Infortuni

L'infortunio e' un attributo dell'assenza, non un terzo stato: prima segni
assente, poi flagghi l'infortunio. Resta un'assenza nelle percentuali, ma
viene conteggiato a parte (colonna `injuries`).

## Temi

Scuro di default, chiaro con l'interruttore in alto a destra. La scelta sta in
`localStorage` e uno script inline in `app/layout.tsx` la applica prima del
primo paint, cosi' non si vede il lampo scuro al ricarico. Senza scelta salvata
si segue `prefers-color-scheme`.

## Aspetto

Il sistema visivo segue seocheck.therope.it: dashboard tecnica scura, nero con
pannelli #0d0d0d, accento rosso #f43, bordi a basso contrasto, pill arrotondate
e micro-etichette in maiuscoletto. I token stanno tutti in `app/globals.css`,
dentro `@theme`. Il font TT Fors del riferimento e' su licenza: qui si usa
Figtree, la geometrica libera piu' vicina.

Negli elenchi il soprannome viene per primo e nome e cognome lo seguono in
grigio; chi non ha soprannome mostra nome e cognome in primo piano
(`components/athlete-name.tsx`).

## Struttura

```
app/                pagine
components/         UI; i toggle dell'appello sono in attendance-board.tsx
lib/actions/        server action per le scritture
lib/auth.ts         requireProfile() e requireAdmin()
utils/supabase/     client browser, server, middleware, admin
middleware.ts       refresh sessione e gate pending/blocked/admin
supabase/schema.sql   schema completo per installazioni nuove
supabase/migration-002-archivi.sql  infortuni e archivi, per database esistenti
```

## Requisiti

Node 20 o superiore. Con versioni precedenti `next dev` fallisce con
`SyntaxError: Unexpected token '?'`.

## Cosa non c'e'

Reset password dal login (l'admin puo' impostarla da `/admin/users`),
notifiche, export, storico delle modifiche, icone PWA
(`public/icon-192.png` e `icon-512.png` vanno aggiunte).
