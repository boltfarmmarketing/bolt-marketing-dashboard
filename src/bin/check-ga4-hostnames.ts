import 'dotenv/config';
import { fetchGA4Totals } from '../fetchers/windsor.js';

// Debug: shows how many visitors GA4 reports per hostname over the last 8 weeks,
// with the GA4_EXCLUDE_HOSTNAMES filter temporarily disabled so we see everything.
// Useful for confirming the filter is doing what it should.

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dateTo = daysAgo(1);
  const dateFrom = daysAgo(56);

  // Disable filter for verification view.
  const savedInclude = process.env.GA4_INCLUDE_HOSTNAMES;
  delete process.env.GA4_INCLUDE_HOSTNAMES;

  const rows = await fetchGA4Totals(dateFrom, dateTo);

  const byHost = new Map<string, number>();
  for (const r of rows) {
    const host = r.hostname || '(unknown)';
    byHost.set(host, (byHost.get(host) || 0) + (Number(r.totalusers) || 0));
  }

  process.env.GA4_INCLUDE_HOSTNAMES = savedInclude;

  const sorted = [...byHost.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, n]) => sum + n, 0);
  console.log(`GA4 visitors by hostname, ${dateFrom} → ${dateTo} (UNFILTERED):\n`);
  for (const [host, n] of sorted) {
    const pct = ((n / total) * 100).toFixed(1).padStart(5);
    console.log(`  ${host.padEnd(45)} ${n.toLocaleString().padStart(10)}  (${pct}%)`);
  }
  console.log(`\n  TOTAL ${' '.repeat(38)} ${total.toLocaleString()}`);

  const included = (savedInclude || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (included.length > 0) {
    const keptTotal = sorted
      .filter(([h]) => included.includes(h.toLowerCase()))
      .reduce((sum, [, n]) => sum + n, 0);
    console.log(`\nWith allowlist "${savedInclude}": ${keptTotal.toLocaleString()} visitors kept (${(keptTotal / total * 100).toFixed(1)}%), ${(total - keptTotal).toLocaleString()} dropped`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
