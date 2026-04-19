import 'dotenv/config';

// Dumps `/options` for each connector so we can confirm the exact field names
// Windsor exposes for *this* account. Run once after creds are in .env, then
// adjust the `fields:` arrays in src/fetchers/windsor.ts to match.

const BASE = 'https://connectors.windsor.ai';
const CONNECTORS = ['google_ads', 'facebook', 'googleanalytics4', 'hubspot'];

async function main() {
  const apiKey = process.env.WINDSOR_API_KEY;
  if (!apiKey) {
    console.error('Set WINDSOR_API_KEY in .env first.');
    process.exit(1);
  }

  for (const c of CONNECTORS) {
    const url = `${BASE}/${c}/options?api_key=${apiKey}`;
    console.log('\n── ' + c + ' ──');
    console.log('  ' + url.replace(apiKey, '••••'));
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log('  HTTP ' + res.status + ': ' + (await res.text()).slice(0, 500));
        continue;
      }
      const json = await res.json();
      const pretty = JSON.stringify(json, null, 2);
      console.log(pretty.length > 4000 ? pretty.slice(0, 4000) + '\n  … (truncated)' : pretty);
    } catch (err) {
      console.log('  Failed: ' + (err instanceof Error ? err.message : err));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
