import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fetchGoogleAds, fetchMeta, fetchGA4, fetchGA4Totals, fetchGA4UniquesForRange } from './fetchers/windsor.js';
import {
  resolveLeadPipelineByName,
  resolveOwnerIdsByName,
  fetchLeadsCreatedInWindow,
  type HubSpotLead,
} from './fetchers/hubspot.js';
import { fetchOliveHistory } from './fetchers/olive.js';
import { aggregate, shiftWeek, weekRange } from './aggregate.js';
import type { DashboardData } from './types.js';

const PUBLIC_DIR = path.resolve('public');
const WEEKS_DIR = path.join(PUBLIC_DIR, 'weeks');

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
  const oliveHistory = await fetchOliveHistory();
  if (oliveHistory.length === 0) throw new Error('No Olive weeks found.');

  const oldestWeek = oliveHistory[0]!.weekOf;
  const latestWeek = oliveHistory[oliveHistory.length - 1]!.weekOf;
  console.log(`  ${oliveHistory.length} weeks: ${oldestWeek} → ${latestWeek}`);

  // Fetch Windsor + HubSpot once over the widest range we'll need:
  // (8 weeks before oldest Olive) → (latest Olive week end). The aggregator
  // filters per-week from this pool so we don't pay N × fetch cost per week.
  const fetchStart = shiftWeek(oldestWeek, -7);
  const fetchEnd = weekRange(latestWeek).end;

  // Prior-year range covers 52w shifted versions of the same window.
  const pyFetchStart = shiftWeek(oldestWeek, -52);
  const pyFetchEnd = weekRange(shiftWeek(latestWeek, -52)).end;

  console.log(`\n── Windsor (current ${fetchStart} → ${fetchEnd}) ──`);
  const [googleAds, meta, ga4, ga4Totals] = await Promise.all([
    safe('Google Ads', () => fetchGoogleAds(fetchStart, fetchEnd), []),
    safe('Meta', () => fetchMeta(fetchStart, fetchEnd), []),
    safe('GA4 (by source)', () => fetchGA4(fetchStart, fetchEnd), []),
    safe('GA4 (totals)', () => fetchGA4Totals(fetchStart, fetchEnd), []),
  ]);
  console.log(`  Google Ads: ${googleAds.length}  Meta: ${meta.length}  GA4: ${ga4.length}  GA4 totals: ${ga4Totals.length}`);

  console.log(`\n── Windsor (prior year ${pyFetchStart} → ${pyFetchEnd}) ──`);
  const [googleAdsPY, metaPY, ga4PY, ga4TotalsPY] = await Promise.all([
    safe('Google Ads PY', () => fetchGoogleAds(pyFetchStart, pyFetchEnd), []),
    safe('Meta PY', () => fetchMeta(pyFetchStart, pyFetchEnd), []),
    safe('GA4 PY (by source)', () => fetchGA4(pyFetchStart, pyFetchEnd), []),
    safe('GA4 PY (totals)', () => fetchGA4Totals(pyFetchStart, pyFetchEnd), []),
  ]);
  console.log(`  Google Ads: ${googleAdsPY.length}  Meta: ${metaPY.length}  GA4: ${ga4PY.length}  GA4 totals: ${ga4TotalsPY.length}`);

  console.log('\n── HubSpot Leads ──');
  const pipeline = await resolveLeadPipelineByName(process.env.HUBSPOT_PIPELINE_NAME || 'Lead pipeline');
  const excludedNames = (process.env.HUBSPOT_EXCLUDED_OWNER_NAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludedOwners = excludedNames.length > 0 ? await resolveOwnerIdsByName(excludedNames) : [];
  const excludeOwnerIds = excludedOwners.map((o) => o.id);
  console.log(`  pipeline: ${pipeline.label}, excluding: ${excludedOwners.map((o) => o.label).join(', ') || '(none)'}`);

  const [hubspot, hubspotPY]: [HubSpotLead[], HubSpotLead[]] = await Promise.all([
    safe(
      'HubSpot current',
      () => fetchLeadsCreatedInWindow(pipeline.id, fetchStart, fetchEnd, { excludeOwnerIds }),
      [] as HubSpotLead[],
    ),
    safe(
      'HubSpot PY',
      () => fetchLeadsCreatedInWindow(pipeline.id, pyFetchStart, pyFetchEnd, { excludeOwnerIds }),
      [] as HubSpotLead[],
    ),
  ]);
  console.log(`  current: ${hubspot.length}  prior year: ${hubspotPY.length}`);

  // ── GA4 weekly uniques (per-week query for true uniques, not summed dailies) ──
  // Each Olive week needs its own 7 history weeks before it, so we cover the
  // full span [shiftWeek(oldest, -7) ... latest]. PY: same shifted 52 weeks.
  console.log('\n── GA4 weekly uniques ──');
  const allWeekStarts: string[] = [];
  for (const ow of oliveHistory) {
    for (let i = -7; i <= 0; i++) {
      const ws = shiftWeek(ow.weekOf, i);
      if (!allWeekStarts.includes(ws)) allWeekStarts.push(ws);
    }
  }
  const allPYWeekStarts = oliveHistory.map((w) => shiftWeek(w.weekOf, -52));

  const weeklyUniquesEntries = await Promise.all(
    allWeekStarts.map(async (ws) => {
      const { start, end } = weekRange(ws);
      const n = await safe(`uniques ${ws}`, () => fetchGA4UniquesForRange(start, end), 0);
      return [ws, n] as const;
    }),
  );
  const weeklyUniques = new Map(weeklyUniquesEntries);

  const pyUniquesEntries = await Promise.all(
    allPYWeekStarts.map(async (ws) => {
      const { start, end } = weekRange(ws);
      const n = await safe(`PY uniques ${ws}`, () => fetchGA4UniquesForRange(start, end), 0);
      return [ws, n] as const;
    }),
  );
  const pyWeeklyUniques = new Map(pyUniquesEntries);
  console.log(`  ${weeklyUniques.size} current + ${pyWeeklyUniques.size} prior-year`);

  // ── Aggregate every Olive week ──────────────────────────────────────
  console.log('\n── Aggregating per week ──');
  await mkdir(WEEKS_DIR, { recursive: true });

  const dashboards = new Map<string, DashboardData>();
  for (const oliveWeek of oliveHistory) {
    const d = aggregate({
      weekOf: oliveWeek.weekOf,
      windsor: { googleAds, meta, ga4, ga4Totals, weeklyUniques },
      windsorPriorYear: { googleAds: googleAdsPY, meta: metaPY, ga4: ga4PY, ga4Totals: ga4TotalsPY, weeklyUniques: pyWeeklyUniques },
      hubspot,
      hubspotPriorYear: hubspotPY,
      olive: oliveHistory,
    });
    dashboards.set(oliveWeek.weekOf, d);
    await writeFile(path.join(WEEKS_DIR, `${oliveWeek.weekOf}.json`), JSON.stringify(d, null, 2));
    console.log(`  ✓ weeks/${oliveWeek.weekOf}.json`);
  }

  // Weeks index (oldest → newest for consistent ordering)
  const index = {
    weeks: oliveHistory.map((w) => ({
      weekOf: w.weekOf,
      start: weekRange(w.weekOf).start,
      end: weekRange(w.weekOf).end,
    })),
    latest: latestWeek,
  };
  await writeFile(path.join(WEEKS_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`  ✓ weeks/index.json`);

  // Keep public/data.json pointing to the latest for bookmark compat
  const latestData = dashboards.get(latestWeek)!;
  await writeFile(path.join(PUBLIC_DIR, 'data.json'), JSON.stringify(latestData, null, 2));
  console.log(`  ✓ data.json (latest = ${latestWeek})`);

  // Summary of the latest week
  const m = latestData.metrics;
  console.log(`\n── Summary (latest week: ${latestWeek}) ──`);
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
