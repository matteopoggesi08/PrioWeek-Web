const fs = require("fs");

const token = process.env.PRIOWEEK_API_TOKEN || "INSERISCI_QUI_IL_TUO_PRODUCTION_API_TOKEN";
const template = fs.readFileSync("config.template.js", "utf8");
const config = template.replace("__PRIOWEEK_API_TOKEN__", token);
fs.writeFileSync("config.js", config, "utf8");

console.log(token.startsWith("INSERISCI_")
  ? "PrioWeek build: PRIOWEEK_API_TOKEN not set; placeholder config generated."
  : "PrioWeek build: production CloudKit configuration generated.");
