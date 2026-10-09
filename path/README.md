# PrioWeek Web 3.1 — categorie iOS

La web app legge le categorie e sottocategorie già presenti nell'app iOS attraverso i record `PWCategoryMetadata` e `PWSubcategoryMetadata` nel Private Database del container `iCloud.com.prioweek.app`. Mantiene un fallback sulle categorie associate alle attività già sincronizzate.

## Configurazione
- Mantieni `config.js` con `containerIdentifier`, `apiToken` e `environment` già usati dal progetto.
- Il record type `PWActivityMetadata` deve già esistere e contenere i campi richiesti dalle versioni precedenti.
- Prima di usare le categorie iOS, aggiungi in CloudKit Development e distribuisci in Production:
  - `PWCategoryMetadata`: `categoryID` String, `name` String, `colorHex` String, `updatedAt` Date/Time.
  - `PWSubcategoryMetadata`: `subcategoryID` String, `name` String, `categoryID` String, `categoryName` String, `updatedAt` Date/Time.
- Nell'app iOS aggiornata, apri PrioWeek e lasciala attiva per almeno 20–30 secondi; poi ricarica/sincronizza la web app.

Le categorie non vengono duplicate in un pannello di gestione: la web app legge quelle pubblicate dall'app iOS. La creazione web di un'attività continua a salvare l'attività nel record CloudKit della web app; non crea direttamente un elemento Apple Promemoria.
