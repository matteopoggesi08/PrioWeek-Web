# PrioWeek Web — categoria Promemoria esclusa

Questa versione esclude il nome legacy `Promemoria` dai controlli categoria del filtro e del form di creazione/modifica, anche se esiste ancora un vecchio record `PWCategoryMetadata` con quel nome. Se si tenta di inserirlo manualmente, il form mostra un messaggio e non salva l'attività.

Non modifica né cancella record CloudKit esistenti e non riclassifica automaticamente le attività già etichettate `Promemoria`. Il catalogo continua a provenire da `PWCategoryMetadata`; le categorie personalizzate devono essere pubblicate dall'app iOS.

Dopo aver sostituito i file nel repository e aver completato il deploy Vercel, ricaricare la web app forzando il refresh.
