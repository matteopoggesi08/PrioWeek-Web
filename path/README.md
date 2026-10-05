# PrioWeek Web v2.5

Web app PrioWeek collegata a CloudKit Production.

## Prima dell'avvio
Apri `config.js` e sostituisci `INSERISCI_QUI_IL_TUO_PRODUCTION_API_TOKEN` con il Production API Token creato nel CloudKit Dashboard. Il token non viene inserito nella UI della Web App.

## Avvio locale
Dalla cartella: `python -m http.server 8080` e apri `http://localhost:8080`. Non usare `file://`.

## Architettura
CloudKit JS 2, container `iCloud.com.prioweek.app`, environment Production. Apple Reminders resta la fonte operativa; PrioWeek Web modifica solo i metadati PrioWeek.


## v2.6
Polished monochrome UI, faster CloudKit reads with desiredKeys, safer visibility sync, and explicit empty-state diagnostics.
