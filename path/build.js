const fs = require('fs');
const token = process.env.PRIOWEEK_CLOUDKIT_API_TOKEN;
if (!token || token.includes('INSERISCI_')) {
  throw new Error('Missing PRIOWEEK_CLOUDKIT_API_TOKEN environment variable');
}
const config = `// Generated at deploy time by Vercel. Do not edit manually.\nwindow.PRIOWEEK_CONFIG = ${JSON.stringify({
  containerIdentifier: 'iCloud.com.prioweek.app',
  environment: 'production',
  apiToken: token
}, null, 2)};\n`;
fs.writeFileSync('config.js', config, 'utf8');
console.log('Generated config.js for CloudKit Production.');
