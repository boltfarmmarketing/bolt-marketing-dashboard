import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchGoogleAds, fetchMeta, fetchGA4, fetchGA4Totals } from './fetchers/windsor.js';
import {
  resolveLeadPipelineByName,
  resolveOwnerIdsByName,
  fetchLeadsCreatedInWindow,
  type HubSpotLead,
} from './fetchers/hubspot.js';
import { fetchOliveHistory, fetchOliveLatest } from './fetchers/olive.js';
import { aggregate, shiftWeek, weekRange } from './aggregate.js';

const OUTPUT_FILE = path.resolve('public/data.json');

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠  ${label} failed — using fallback: ${msg.slice(0, 200)}`);
    return fallback;
  }
}

async function main() {
  console.log('── Reading Olive ──');
  const latestOlive = await fetchOliveLatest();
  const oliveHistory = await fetchOliveHistory();
  const weekOf = latestOlive.weekOf;
  console.log(`  weekOf: ${weekOf}`);
  console.log(`  history: ${oliveHistory.length} weeks`);

  // 8-week range for sparklines + prior week
  const historyStart = shiftWeek(weekOf, -7);
  const historyEnd = weekRange(weekOf).end;

  // Prior-year week (for YoY)
  const priorYearWeek = shiftWeek(weekOf, -52);
  const pyRange = weekRange(priorYearWeek);

  console.log(`\n── Fetching Windsor (current 8-week range ${historyStart} → ${historyEnd}) ──`);
  const [googleAds, meta, ga4, ga4Totals] = await Promise.all([
    safe('Google Ads', () => fetchGoogleAds(historyStart, historyEnd), []),
    safe('Meta', () => fetchMeta(historyStart, historyEnd), []),
    safe('GA4 (by source/medium)', () => fetchGA4(historyStart, historyEnd), []),
    safe('GA4 (site-wide)', () => fetchGA4Totals(historyStart, historyEnd), []),
  ]);
  console.log(`  Google Ads:      ${googleAds.length} rows`);
  console.log(`  Meta:            ${meta.length} rows`);
  console.log(`  GA4 (by source): ${ga4.length} rows`);
  console.log(`  GA4 (totals):    ${ga4Totals.length} rows`);

  console.log(`\n── Fetching Windsor (prior year ${pyRange.start} → ${pyRange.end}) ──`);
  const [googleAdsPY, metaPY, ga4PY, ga4TotalsPY] = await Promise.all([
    safe('Google Ads (PY)', () => fetchGoogleAds(pyRange.start, pyRange.end), []),
    safe('Meta (PY)', () => fetchMeta(pyRange.start, pyRange.end), []),
    safe('GA4 (PY, by source)', () => fetchGA4(pyRange.start, pyRange.end), []),
    safe('GA4 (PY, totals)', () => fetchGA4Totals(pyRange.start, pyRange.end), []),
  ]);
  console.log(`  Google Ads:      ${googleAdsPY.length} rows`);
  console.log(`  Meta:            ${metaPY.length} rows`);
  console.log(`  GA4 (by source): ${ga4PY.length} rows`);
  console.log(`  GA4 (totals):    ${ga4TotalsPY.length} rows`);

  console.log(`\n── Fetching HubSpot Leads ──`);
  const pipeline = await resolveLeadPipelineByName(process.env.HUBSPOT_PIPELINE_NAME || 'Lead pipeline');
  const excludedNames = (process.env.HUBSPOT_EXCLUDED_OWNER_NAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedOwners = excludedNames.length > 0 ? await resolveOwnerIdsByName(excludedNames) : [];
  const excludeOwnerIds = excludedOwners.map((o) => o.id);
  console.log(`  pipeline: ${pipeline.label}`);
  console.log(`  excluding owners: ${excludedOwners.map((o) => o.label).join(', ') || '(none)'}`);

  const [hubspot, hubspotPY]: [HubSpotLead[], HubSpotLead[]] = await Promise.all([
    safe(
      'HubSpot 8-week',
      () => fetchLeadsCreatedInWindow(pipeline.id, historyStart, historyEnd, { excludeOwnerIds }),
      [] as HubSpotLead[],
    ),
    safe(
      'HubSpot prior-year',
      () => fetchLeadsCreatedInWindow(pipeline.id, pyRange.start, pyRange.end, { excludeOwnerIds }),
      [] as HubSpotLead[],
    ),
  ]);
  console.log(`  current 8-week: ${hubspot.length} leads`);
  console.log(`  prior year:     ${hubspotPY.length} leads`);

  console.log('\n── Aggregating ──');
  const dashboard = aggregate({
    weekOf,
    windsor: { googleAds, meta, ga4, ga4Totals },
    windsorPriorYear: { googleAds: googleAdsPY, meta: metaPY, ga4: ga4PY, ga4Totals: ga4TotalsPY },
    hubspot,
    hubspotPriorYear: hubspotPY,
    olive: oliveHistory,
  });

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(dashboard, null, 2));
  console.log(`\n✓ wrote ${OUTPUT_FILE}`);

  // Summary
  const m = dashboard.metrics;
  console.log('\n── Summary ──');
  console.log(`  Qualified Leads:     ${m.qualifiedLeads.current}`);
  console.log(`  Website Visitors:    ${m.totalVisitors.current.toLocaleString()}`);
  console.log(`  Conversion Rate:     ${(m.conversionRate.current * 100).toFixed(2)}%`);
  console.log(`  Google Ads Spend:    $${Math.round(m.googleAdsSpend.current).toLocaleString()}`);
  console.log(`  Meta Ads Spend:      $${Math.round(m.metaAdsSpend.current).toLocaleString()}`);
  console.log(`  Cost Per Booking:    $${Math.round(m.costPerBooking.current).toLocaleString()}`);
  console.log(`  Total Booking Value: $${Math.round(m.totalBookingValue.current).toLocaleString()}`);
  console.log(`  ROAS:                ${m.roas.current.toFixed(2)}x`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
