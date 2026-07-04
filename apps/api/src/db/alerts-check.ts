// Vérification manuelle des alertes de prix wishlist.
//   pnpm alerts:check [--dry-run]
// (le serveur API fait aussi ce passage toutes les 6 h)
import { checkPriceAlerts } from '../lib/price-alerts.js';

const dryRun = process.argv.includes('--dry-run');
const sent = await checkPriceAlerts({ dryRun });
console.log(`${sent} alerte(s) ${dryRun ? 'détectée(s) (dry-run)' : 'envoyée(s)'}`);
process.exit(0);
