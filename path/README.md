# PrioWeek Web — Vercel Production

Questa versione è predisposta per la sincronizzazione automatica con CloudKit Production.

## Deploy su GitHub
Carica **il contenuto di questa cartella nella root del repository** `PrioWeek-Web`. Non deve esserci una cartella `path/` sopra `package.json`.

## Deploy su Vercel
- Root Directory: vuota / `.`
- Framework: Other
- Build Command: `npm run build`
- Output Directory: `.`
- Environment: **Production**
- Variable: `PRIOWEEK_API_TOKEN` = il Production API Token CloudKit del container `iCloud.com.prioweek.app`

Il build genera automaticamente `config.js`.

## Sincronizzazione
Dopo l'autenticazione Apple, PrioWeek Web carica automaticamente i record dal Private Database CloudKit. La sincronizzazione viene ripetuta automaticamente ogni 30 secondi e quando la pagina torna visibile o riceve il focus. Non è necessario premere "Sincronizza ora".

Se CloudKit non risponde entro 15 secondi, la UI mostra un errore invece di restare bloccata indefinitamente.

## Importante
La variabile Vercel evita di committare il token nel repository, ma un token utilizzato da una web app client-side può essere osservabile dal browser. Le regole di sicurezza devono quindi essere configurate correttamente in CloudKit.


## Compatibilità con PrioWeek iOS build 43

La build iOS 1.16 build 43 salva i metadati nel container `iCloud.com.prioweek.app`,
nel **Private Cloud Database**, usando record `PWActivityMetadata` con nomi `task-<UUID>`.
La web app legge lo stesso record type e gli stessi campi.

Nota importante: `plannedWeekStart` è opzionale in iOS e può essere `nil` per le nuove attività.
Questa versione web non nasconde più tali attività: usa la settimana della scadenza Apple Promemoria
come fallback; i promemoria senza scadenza vengono mostrati nella settimana corrente.

La sincronizzazione richiede:
- che iPhone e web siano autenticati con lo stesso account Apple/iCloud;
- che la build iOS abbia effettivamente caricato i record su CloudKit Production;
- che `PRIOWEEK_API_TOKEN` sia impostata in Vercel per il Production Deployment;
- che il container CloudKit abbia configurato correttamente Web Services e autenticazione web.

La web app non può leggere direttamente i dati locali di Apple Promemoria: legge i record CloudKit
pubblicati dalla app iOS. La sincronizzazione automatica della web app ripete la lettura ogni 30 secondi
quando la pagina è visibile.
