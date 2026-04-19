import 'dotenv/config';
import { fetchWindsor } from '../fetchers/windsor.js';

// Pulls the last 7 days from all 4 Windsor sources and dumps a sample row
// per source. Use this to sanity-check field names and values against the
// native platform UI before wiring the aggregator.

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dateTo = daysAgo(1);
  const dateFrom = daysAgo(7);
  console.log(`Pulling ${dateFrom} → ${dateTo}\n`);

  const bundle = await fetchWindsor(dateFrom, dateTo);

  for (const [key, result] of Object.entries(bundle)) {
    if (!result.ok) {
      console.log(`✗ ${key}: ${result.error}`);
      continue;
    }
    console.log(`✓ ${key}: ${result.rows.length} rows`);
    if (result.rows.length > 0) {
      console.log('  first row: ' + JSON.stringify(result.rows[0]).slice(0, 400));
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
