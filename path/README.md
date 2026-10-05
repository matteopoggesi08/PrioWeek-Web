# PrioWeek Web — Vercel Production

Questa versione è predisposta per la pubblicazione su Vercel senza inserire il Production API Token nel repository.

## 1. Vercel — Environment Variable

Nel progetto Vercel vai in:
**Settings → Environment Variables → Add New**

Nome:
`PRIOWEEK_CLOUDKIT_API_TOKEN`

Valore:
**il tuo Production API Token CloudKit**

Seleziona:
- Production
- Preview (consigliato se vuoi testare le preview)
- Development (solo se vuoi usare la stessa configurazione nei deploy Vercel di sviluppo)

Salva.

## 2. Deploy

Il build command è già configurato:
`npm run build`

Durante il deploy `build.js` genera `config.js` usando la variabile Vercel.

NON inserire il token nel repository e NON modificare `config.js` manualmente per il deploy Vercel.

## Nota di sicurezza importante

CloudKit JS è un SDK browser-side: il token necessario al client viene inevitabilmente inviato al browser. La variabile Vercel protegge il token dal repository e dalla cronologia del codice, ma non rende il token segreto rispetto all'utente del sito. Per CloudKit JS questo è il modello previsto da Apple. Per maggiore sicurezza futura si può introdurre un backend/proxy server-side.

## 3. Dominio

Quando il deploy è verificato, collega il dominio da:
**Vercel → Settings → Domains**

Esempio:
`app.prioweek.com`

## 4. CloudKit API Token

Il token deve essere un token **Production** del container:
`iCloud.com.prioweek.app`

Non usare il token Development della POC.
