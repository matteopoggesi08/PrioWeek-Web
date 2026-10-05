const fs = require('fs');
const token = process.env.PRIOWEEK_API_TOKEN || '';
if (!token) {
  console.warn('WARNING: PRIOWEEK_API_TOKEN is not set. CloudKit sync will not work in Production.');
}
const config = `window.PRIOWEEK_CONFIG = ${JSON.stringify({
  containerIdentifier: 'iCloud.com.prioweek.app',
  environment: 'production',
  apiToken: token
}, null, 2)};\n`;
fs.writeFileSync('config.js', config);
console.log('PrioWeek: Production CloudKit config generated.');
