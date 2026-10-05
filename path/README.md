# PrioWeek Web v2.6

Web app PrioWeek collegata a CloudKit Production.

## Struttura
Questo progetto è già predisposto con i file nella root. Non usare una Root Directory `path` su Vercel.

## GitHub
Carica il contenuto di questa cartella direttamente nella root del repository `PrioWeek-Web`.

## Vercel
- Root Directory: lascia vuota (`.`)
- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `.`
- Install Command: `npm install` (oppure automatico)
- Environment Variable Production:
  - Name: `PRIOWEEK_API_TOKEN`
  - Value: il Production API Token CloudKit

Il build genera automaticamente `config.js` usando `PRIOWEEK_API_TOKEN`.

## Nota importante sul token
Il token CloudKit necessario dal browser finirà comunque nel JavaScript consegnato al client: una variabile Vercel non può renderlo segreto rispetto all'utente finale. La variabile d'ambiente evita di committarlo su GitHub, ma non è una protezione da esposizione lato browser.

## Avvio locale
Apri `config.js` con un token valido oppure esegui il build con:
`PRIOWEEK_API_TOKEN=... npm run build`
e poi usa un server statico, ad esempio:
`python -m http.server 8080`

## Architettura
CloudKit JS 2, container `iCloud.com.prioweek.app`, environment Production. Apple Reminders resta la fonte operativa; PrioWeek Web modifica solo i metadati PrioWeek.
