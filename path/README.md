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
