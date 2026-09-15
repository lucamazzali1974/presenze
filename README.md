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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | solo per le push |
| `VAPID_PRIVATE_KEY` | idem, la meta' privata | solo per le push |
| `VAPID_SUBJECT` | `mailto:tua@email.it` | solo per le push |
| `CRON_SECRET` | inventala, lunga | solo per le push |

La secret key serve solo a creare, eliminare e cambiare password agli utenti
da `/admin/users`. Bypassa la RLS: niente prefisso `NEXT_PUBLIC_`, mai in un
commit. Senza, l'app funziona e gli accessi si approvano comunque, ma non si
creano dall'interno.

## Pagine

| Percorso | Chi | Cosa |
|---|---|---|
| `/` | tutti | appello del prossimo allenamento e della prossima partita |
| `/atleti` | tutti | rosa completa; form, modifiche e accessi solo per admin |
| `/calendario` | non admin | eventi in programma in sola lettura, con link all'appello |
| `/profilo` | tutti | come entri, cambio password, notifiche (solo atleti) |
| `/stats` | tutti | percentuali per giocatore, allenamenti e partite separati |
| `/events/[id]` | tutti | appello di un evento specifico, anche passato |
| `/admin/events` | admin | calendario, date singole e ricorrenti |
| `/admin/teams` | admin | squadre e composizione delle rose |
| `/archivio` | tutti | periodi archiviati; ripristino ed eliminazione per gli admin |
| `/archivio/[id]` | tutti | percentuali fotografate e calendario del periodo, con CSV |
| `/admin/users` | admin | accessi: creazione, approvazione, blocco, ruolo, collegamento alla scheda atleta |

## Deploy

Push su GitHub, import su Vercel, le tre variabili d'ambiente su Production,
Preview e Development. Poi in Supabase, Authentication > URL Configuration:
Site URL sul dominio Vercel, e nei Redirect URLs
`https://tuo-dominio.vercel.app/**` e `http://localhost:3000/**`.

Il workflow in `.github/workflows/keepalive.yml` evita che il progetto
Supabase free vada in pausa dopo 7 giorni di inattivita': aggiungi i secret
`SUPABASE_URL` e `SUPABASE_ANON_KEY` nelle impostazioni del repository (per
il secondo vale anche la publishable key).

## Squadre

Un giocatore puo' stare in **piu' squadre** (l'U18 che gioca anche in prima):
l'appartenenza e' la tabella ponte `team_members`, non una colonna su
`athletes`.

Un evento ha `team_id`, e **`null` significa "tutta la societa'"**: vale per
chiunque sia in rosa. Gli eventi creati prima delle squadre restano cosi',
quindi l'app continua a funzionare come sempre finche' non crei la prima
squadra.

La regola di conteggio sta in `event_covers_athlete(team_id, athlete_id)`:
un evento entra nelle percentuali di un atleta solo se non ha squadra oppure
se l'atleta e' iscritto a quella squadra. Senza, un U18 risulterebbe assente
a ogni allenamento della prima squadra.

`attendance_stats` ha quindi una riga per **atleta, tipo e squadra**. Il
totale su piu' squadre lo somma l'app (`lib/stats.ts`, `sumStats`), che
ricalcola la percentuale sui totali invece di fare la media delle
percentuali: 1/1 e 0/9 non fanno il 50%.

Eliminare una squadra non cancella niente: gli atleti restano, le presenze
restano, e i suoi eventi tornano `team_id` nullo, cioe' validi per tutti.

Gli **archivi** restano trasversali: si archivia un periodo, non una squadra,
e la fotografia resta nella forma aggregata di prima. Per questo il pulsante
"Archivia un periodo" compare solo con il filtro su "Tutte le squadre".

## Accesso col soprannome

Supabase Auth autentica con email o telefono, non con un nome utente: non
c'e' modo di aggirarlo. Il giro e' in `lib/username.ts`: al soprannome si
appiccica un dominio finto (`ATHLETE_EMAIL_DOMAIN`) e l'indirizzo che ne
esce fa da nome utente. "Ciccio Rossi" diventa `ciccio.rossi`, cioe'
`ciccio.rossi@atleti.presenze.app`.

Nessuna email viene mai spedita a quegli indirizzi, quindi **la conferma
email dev'essere spenta** (Authentication > Sign In / Providers > Email >
Confirm email). Il login ha un solo campo: se contiene una chiocciola e'
un'email, altrimenti e' un soprannome e l'indirizzo si ricostruisce.

`ATHLETE_EMAIL_DOMAIN` **non si cambia dopo aver creato degli accessi**:
l'indirizzo si ricostruisce a ogni login, quindi cambiarlo li rende tutti
inutilizzabili.

L'admin crea l'accesso da `/atleti`, sul giocatore, con "Crea accesso":
nome utente (proposto dal soprannome) e password provvisoria, da
comunicare a voce. Da li' si cambia anche la password o si rimuove
l'accesso — rimuoverlo non tocca ne' il giocatore ne' le sue presenze,
`athletes.profile_id` e' `on delete set null`. Serve
`SUPABASE_SECRET_KEY`: senza, il pannello lo dice e gli accessi esistenti
continuano a funzionare.

## Accesso degli atleti

Oltre ad `admin` e `user` (l'allenatore) c'e' il ruolo **`athlete`**. Un
account atleta si collega a una scheda in anagrafica tramite
`athletes.profile_id` (unique: un account, un giocatore), e il
collegamento lo fa l'admin da `/admin/users`. Finche' non lo fai
l'account entra ma non ha niente da segnare, e l'app glielo dice.

Cosa cambia per lui: sul tabellone vede **solo la propria riga** (i totali
di squadra in testata restano, cosi' sa quanti sono i presenti), in
Percentuali vede **solo se stesso**, e l'Archivio sparisce dal menu.

Il limite non e' nel frontend, e' nella RLS — cioe' vale anche per chi
interroga l'API con la chiave pubblica:

- `athlete_can_mark(event_id, athlete_id)` consente insert, update e
  delete su `absences` solo se la riga e' la sua, l'evento e' aperto
  (`closed_at is null`), non archiviato, e lo riguarda davvero (la sua
  squadra)
- `attendance_stats` filtra con `is_staff() or a.id = my_athlete_id()`:
  la riduzione avviene nella vista, non nella pagina
- `archives` passa in lettura al solo staff, perche' `snapshot` contiene
  le percentuali di tutti
- chiudere l'appello passa da `set_event_closed()`, security definer con
  controllo `is_staff()`. Serviva comunque: la policy su `events` e'
  riservata agli admin, quindi prima un allenatore non-admin non riusciva
  a chiudere l'appello, e allargare quella policy gli avrebbe dato anche
  data, luogo e squadra di ogni evento

`is_active()` resta "qualunque utente attivo" e regola le letture;
`is_staff()` e' il nuovo nome di chi fa l'appello di tutti.

## Partite

Oltre a data, ora e luogo, una partita ha **squadra avversaria**
(`events.opponent`) e **ora di ritrovo** (`events.meet_at`). I due campi
compaiono nel form solo scegliendo "Partita", e cambiando tipo a un
evento gia' esistente si azzerano: su un allenamento non vogliono dire
niente e lasciarli appiccicati confonderebbe.

`meet_at` e' un timestamptz, non una semplice ora: si formatta con gli
stessi strumenti di `starts_at` e non perde il fuso.

In calendario le partite si riconoscono dal filo blu a sinistra, e i
loro dati stanno in una scheda (`.facts`) invece che in una riga di
testo con i punti: data, ritrovo, inizio, avversario e campo, ognuno con
la sua etichetta.

## Indirizzo e Maps

`events.location` e' il nome del campo ("Campo GEAS"), `events.address`
la via. Sono due cose diverse: una si legge, l'altra si naviga.

Il link usa l'URL universale di Google Maps
(`maps/search/?api=1&query=...`, vedi `lib/maps.ts`): **niente API key,
niente SDK, nessun costo**. Su telefono apre l'app di Maps, su desktop
il sito, e funziona anche se il predefinito e' Apple Mappe. Il
completamento automatico dell'indirizzo mentre scrivi richiederebbe
Places Autocomplete, cioe' una chiave Google Cloud con fatturazione
attiva: non ne vale la pena per un campo che si compila una volta.

## Aggiornamento e attesa

`components/auto-refresh.tsx` chiama `router.refresh()` ogni 5 minuti:
rifa' il rendering lato server e **lascia intatto lo stato dei
componenti client** — l'appello a meta' compilazione, i filtri, il testo
nelle caselle. Con la scheda in secondo piano non fa niente, e riprende
appena torna visibile aggiornando subito se e' passato il tempo.

Per l'attesa ci sono tre cose distinte:

- `loading.tsx` su ogni rotta, con `PageSkeleton`: durante la
  navigazione compare la struttura della pagina invece di uno schermo
  vuoto. Include una barra in alto finta, se no il contenuto salterebbe
- `<Busy>` (`components/spinner.tsx`): la pillola in alto che compare
  durante salvataggi e cancellazioni. E' `position: fixed`, quindi non
  sposta niente sotto le dita
- Lo `<Spinner>` dentro i bottoni che avviano un'operazione lunga

La home prende le assenze **annidate** nella query degli eventi
(`select('*, absences(...)')`) invece che con una seconda chiamata: due
giri di rete in meno a ogni apertura, che col segnale del campo si
sentono.

## Utenti

L'elenco e' raggruppato: prima lo **Staff** (admin e allenatori, che non
appartengono a una squadra), poi una sezione per squadra con i suoi
giocatori, in fondo chi non e' assegnato. Dentro ogni gruppo c'e' una
sottosezione per ruolo, e ogni sottosezione mostra al massimo 30 righe
con un "mostra gli altri". La ricerca compare oltre le 30 righe totali e
scavalca i tagli.

Le squadre di un account arrivano dalla sua scheda atleta: i profili non
hanno una squadra propria.

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

## Web app installabile

Il progetto e' una PWA: manifest, icone, service worker e un invito
all'installazione che compare dopo qualche secondo (`components/install-prompt.tsx`).

Su Chrome e Android il banner usa l'evento `beforeinstallprompt` e installa
con un tocco. Su iOS quell'evento non esiste: Safari permette solo istruzioni,
quindi il banner dice di usare Condividi > Aggiungi a Home.

Chi chiude il banner non lo rivede per due settimane; chi ha gia' installato
non lo vede affatto.

Il service worker (`public/sw.js`) **non mette in cache le pagine** di
proposito: l'appello deve sempre riflettere il database. In cache finiscono
solo gli asset di `/_next/static/`, che hanno l'hash nel nome, piu' la pagina
`offline.html`. Se cambi `public/sw.js`, alza `VERSION` dentro al file,
altrimenti i browser tengono il vecchio.

Le icone sono generate (`public/icon-*.png`). Per sostituirle servono almeno
192x192 e 512x512, piu' le due maskable con il contenuto nell'80% centrale.

Attenzione al matcher in `middleware.ts`: `sw.js`, `manifest.json` e
`offline.html` sono esclusi apposta. Se il middleware li rimanda al login,
l'installazione non parte.

## Offline

A bordo campo il segnale manca spesso, quindi l'appello continua a funzionare
senza rete.

**Lettura**: il service worker tiene l'ultima copia di ogni pagina visitata
(network-first, quindi con il segnale si vedono sempre i dati veri). Aprendo
l'app offline si rivede l'ultimo appello caricato. La cache delle pagine viene
svuotata quando si passa da `/login`, cosi' su un telefono condiviso non resta
l'appello di chi c'era prima.

**Scrittura**: ogni modifica che non raggiunge il server finisce in una coda in
`localStorage` (`lib/offline-queue.ts`) e riparte da sola al ritorno del
segnale, con un tentativo anche ogni 30 secondi perche' l'evento `online`
scatta quando esiste una rete, non quando funziona.

La coda salva **l'intenzione finale** per ogni coppia evento+atleta, non la
cronologia dei tocchi: assente, presente, assente lascia una sola voce.
La sincronizzazione e' quindi idempotente e l'ultimo stato vince, che e' cio'
che l'allenatore si aspetta. Le scritture usano `upsert` per lo stesso motivo.

Una barra in basso dice sempre a che punto si e': rossa quando manca la rete,
ambra quando ci sono modifiche ancora da mandare. Quando c'e' quella, l'invito
a installare l'app non compare: occupano lo stesso posto e salvare viene prima.

Limite noto: due dispositivi che modificano lo stesso atleta offline si
sovrascrivono a vicenda, vince chi sincronizza per ultimo. Con un solo
allenatore che compila non capita.

## Notifiche push

Nei giorni con un evento, i giocatori ricevono un promemoria alle 9 del
mattino: *"Oggi allenamento alle 19:00 — Muggio' — segnala se non ci
sarai"*. Il tocco apre l'appello di quell'evento. Lo staff non le riceve:
compila l'appello guardando il campo.

**Riceve solo chi ha davvero bisogno di rispondere**: i convocati
dell'evento (la rosa della sua squadra, o tutti se l'evento non ne ha),
con un account atleta attivo, che non si sono gia' segnati assenti.

### Come si mette in piedi

1. `npx web-push generate-vapid-keys` genera la coppia di chiavi.
2. Su Vercel (Production, Preview, Development) e in `.env.local`:
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (un `mailto:`), e `CRON_SECRET` a piacere. Poi **Redeploy**.
3. Esegui `supabase/migration-007-notifiche.sql`.
4. Su GitHub, Settings > Secrets and variables > Actions: `APP_URL` e
   `CRON_SECRET` (lo stesso valore di Vercel).
5. Ogni giocatore attiva le notifiche dal suo **Profilo**. Il permesso
   deve partire da un suo tocco: non si puo' forzare da codice.

### Perche' il workflow parte due volte

`.github/workflows/reminders.yml` gira alle 07:00 e alle 08:00 UTC. Cron
non conosce l'ora legale, quindi una delle due corse cade alle 9 italiane
e l'altra no: la API route controlla l'ora locale e scarta quella
sbagliata. Il Vercel Cron non andava bene: sul piano Hobby e' limitato a
una volta al giorno con precisione a +/- 59 minuti.

`reminder_log` (una riga per evento e per giorno, chiave primaria
`event_id + sent_on`) impedisce il doppio invio: la riga si scrive prima
di spedire, e il conflitto e' il segnale di "gia' fatto". La tabella ha
la RLS attiva e nessuna policy, quindi ci arriva solo il job con la
secret key.

Per provarla senza aspettare: Actions > Promemoria del mattino > Run
workflow, spuntando **force**.

### Limiti da conoscere

Su iPhone le push arrivano **solo con l'app installata** sulla schermata
Home, da iOS 16.4 in su. Da Safari normale il permesso non si puo'
neanche chiedere, e il Profilo lo dice spiegando come installarla. Su
Android funzionano anche dal browser.

Le iscrizioni scadono da sole: quando il servizio push risponde 404 o
410 la riga viene cancellata, e il giocatore deve riattivarle dal
Profilo.

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
supabase/migration-002-archivi.sql     infortuni e archivi
supabase/migration-003-joined-on.sql   allinea joined_on della rosa esistente
supabase/migration-004-orari.sql       audit degli orari salvati col fuso sbagliato
supabase/migration-005-squadre.sql     squadre e appartenenza multipla
supabase/migration-006-accesso-atleti.sql  ruolo athlete, RLS per atleta
supabase/migration-007-notifiche.sql   iscrizioni push e registro invii
supabase/migration-008-partite.sql     avversario e ritrovo, eventi alla squadra
supabase/migration-009-indirizzo.sql   indirizzo del campo per Maps
```

## Requisiti

Node 20 o superiore. Con versioni precedenti `next dev` fallisce con
`SyntaxError: Unexpected token '?'`.

## Cosa non c'e'

Reset password dal login (l'admin puo' impostarla da `/admin/users`),
notifiche, export, storico delle modifiche, icone PWA
(`public/icon-192.png` e `icon-512.png` vanno aggiunte).
