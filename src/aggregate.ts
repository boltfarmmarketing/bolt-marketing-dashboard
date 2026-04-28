import type { GoogleAdsRow, MetaRow, GA4Row, GA4TotalsRow } from './fetchers/windsor.js';
import type { HubSpotLead } from './fetchers/hubspot.js';
import type { OliveWeek, BookingSource } from './fetchers/olive.js';
import { totalRevenue as oliveTotalRevenue } from './fetchers/olive.js';
import type {
  DashboardData,
  MetricBasic,
  MetricWithSources,
  WeekPoint,
} from './types.js';

// ── Date helpers (ISO YYYY-MM-DD strings, UTC) ──────────────────────────

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shiftWeek(weekOf: string, deltaWeeks: number): string {
  return addDays(weekOf, deltaWeeks * 7);
}

export function weekRange(weekOf: string): { start: string; end: string } {
  return { start: weekOf, end: addDays(weekOf, 6) };
}

function inWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function safeDiv(num: number, denom: number): number | null {
  if (!isFinite(num) || !isFinite(denom) || denom === 0) return null;
  return num / denom;
}

// ── GA4 source bucketing ────────────────────────────────────────────────

const META_SOURCES = ['facebook', 'fb', 'meta', 'instagram', 'ig'];
const PAID_MEDIUMS = ['cpc', 'paid', 'ppc', 'paid_social', 'paidsocial', 'paid-social'];

function ga4Bucket(row: GA4Row): BookingSource | 'other' {
  const source = String(row.source || '').toLowerCase();
  const medium = String(row.medium || '').toLowerCase();

  if (source.includes('google') && PAID_MEDIUMS.includes(medium)) return 'googleAds';
  if (META_SOURCES.some((s) => source.includes(s)) && PAID_MEDIUMS.includes(medium)) return 'metaAds';
  if (medium === 'organic') return 'organic';
  if (source === '(direct)' || medium === '(none)' || medium === '') return 'direct';
  return 'other';
}

// ── Per-week sum helpers ────────────────────────────────────────────────

function sumGoogleAdsCost(rows: GoogleAdsRow[], start: string, end: string): number {
  let total = 0;
  for (const r of rows) {
    if (inWindow(r.date, start, end)) total += Number(r.cost) || 0;
  }
  return total;
}

function sumMetaSpend(rows: MetaRow[], start: string, end: string): number {
  let total = 0;
  for (const r of rows) {
    if (inWindow(r.date, start, end)) total += Number(r.spend) || 0;
  }
  return total;
}

// Site-wide visitors — sum daily uniques from the totals query (no source/medium
// dimension). Summing the broken-out rows would double-count multi-source users.
function sumGA4Users(rows: GA4TotalsRow[], start: string, end: string): number {
  let total = 0;
  for (const r of rows) {
    if (inWindow(r.date, start, end)) total += Number(r.totalusers) || 0;
  }
  return total;
}

function ga4UsersBySource(
  rows: GA4Row[],
  start: string,
  end: string,
): Record<BookingSource, number> {
  const out: Record<BookingSource, number> = { googleAds: 0, metaAds: 0, organic: 0, direct: 0 };
  for (const r of rows) {
    if (!inWindow(r.date, start, end)) continue;
    const bucket = ga4Bucket(r);
    if (bucket === 'other') continue;
    out[bucket] += Number(r.totalusers) || 0;
  }
  return out;
}

function countHubSpotLeads(leads: HubSpotLead[], start: string, end: string): number {
  let n = 0;
  for (const lead of leads) {
    const created = lead.properties.hs_createdate;
    if (!created) continue;
    const day = created.slice(0, 10);
    if (inWindow(day, start, end)) n++;
  }
  return n;
}

function findOliveWeek(olive: OliveWeek[], weekOf: string): OliveWeek | undefined {
  return olive.find((w) => w.weekOf === weekOf);
}

function totalBookings(week: OliveWeek): number {
  return Object.values(week.bookings).reduce((a, b) => a + b, 0);
}

// ── Metric builders ─────────────────────────────────────────────────────

type WeekValue<T = number | null> = { week: string; value: T };

function buildSeries<T>(weekStarts: string[], computeAt: (weekOf: string) => T): WeekValue<T>[] {
  return weekStarts.map((w) => ({ week: w, value: computeAt(w) }));
}

// Convert null-safe series to WeekPoint[] (drop weeks with null values for sparkline)
function toWeekPoints(series: WeekValue<number | null>[]): WeekPoint[] {
  return series
    .filter((p): p is WeekValue<number> => p.value !== null)
    .map((p) => ({ week: p.week, value: p.value }));
}

function metricBasic(
  series: WeekValue<number | null>[],
  priorYearValue: number | null,
): MetricBasic {
  const currentPoint = series[series.length - 1];
  const priorPoint = series[series.length - 2];
  return {
    current: currentPoint?.value ?? 0,
    prior: priorPoint?.value ?? 0,
    priorYear: priorYearValue ?? 0,
    history: toWeekPoints(series),
  };
}

function metricWithSources(
  base: MetricBasic,
  bySource: Record<string, number>,
  bySourceSecondary?: Record<string, number>,
): MetricWithSources {
  return bySourceSecondary
    ? { ...base, bySource, bySourceSecondary }
    : { ...base, bySource };
}

// ── Input / output ──────────────────────────────────────────────────────

export interface WindsorSlice {
  googleAds: GoogleAdsRow[];
  meta: MetaRow[];
  ga4: GA4Row[];
  ga4Totals: GA4TotalsRow[];
  // Map of week-start (YYYY-MM-DD Monday) → true GA4 unique users for that week,
  // computed via per-week GA4 queries (no date dim) so users aren't counted once
  // per day they visited.
  weeklyUniques: Map<string, number>;
}

export interface AggregateInput {
  weekOf: string;
  windsor: WindsorSlice;
  windsorPriorYear: WindsorSlice;
  hubspot: HubSpotLead[];
  hubspotPriorYear: HubSpotLead[];
  olive: OliveWeek[];
}

export function aggregate(input: AggregateInput): DashboardData {
  const { weekOf, windsor, windsorPriorYear, hubspot, hubspotPriorYear, olive } = input;

  // Build 8-week series of anchor Mondays ending at weekOf (oldest → newest)
  const weekStarts = Array.from({ length: 8 }, (_, i) => shiftWeek(weekOf, i - 7));
  const priorYearWeek = shiftWeek(weekOf, -52);
  const pyRange = weekRange(priorYearWeek);

  // ── Qualified Leads (HubSpot) ─────────────────────────────────────────
  const qualifiedLeadsSeries = buildSeries<number | null>(weekStarts, (w) => {
    const { start, end } = weekRange(w);
    return countHubSpotLeads(hubspot, start, end);
  });
  const qualifiedLeadsPY = countHubSpotLeads(hubspotPriorYear, pyRange.start, pyRange.end);

  // ── Total Visitors (GA4 weekly uniques) ───────────────────────────────
  const visitorsSeries = buildSeries<number | null>(weekStarts, (w) => {
    return windsor.weeklyUniques.get(w) ?? null;
  });
  const visitorsPY = windsorPriorYear.weeklyUniques.get(priorYearWeek) ?? 0;

  // Top 5 traffic sources for the active week (ranking only — uses
  // source-broken-out rows, which are daily-uniques summed across days).
  const visitorsTopSources: Record<string, number> = (() => {
    const cur = weekRange(weekOf);
    const bySrc: Record<string, number> = {};
    for (const r of windsor.ga4) {
      if (!inWindow(r.date, cur.start, cur.end)) continue;
      const src = String(r.source || '(unknown)').toLowerCase();
      bySrc[src] = (bySrc[src] ?? 0) + (Number(r.totalusers) || 0);
    }
    const sorted = Object.entries(bySrc).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return Object.fromEntries(sorted);
  })();

  // ── Google Ads Spend ──────────────────────────────────────────────────
  const googleAdsSpendSeries = buildSeries<number | null>(weekStarts, (w) => {
    const { start, end } = weekRange(w);
    return sumGoogleAdsCost(windsor.googleAds, start, end);
  });
  const googleAdsSpendPY = sumGoogleAdsCost(windsorPriorYear.googleAds, pyRange.start, pyRange.end);

  // ── Meta Spend ────────────────────────────────────────────────────────
  const metaSpendSeries = buildSeries<number | null>(weekStarts, (w) => {
    const { start, end } = weekRange(w);
    return sumMetaSpend(windsor.meta, start, end);
  });
  const metaSpendPY = sumMetaSpend(windsorPriorYear.meta, pyRange.start, pyRange.end);

  // ── Olive-dependent series (bookings, revenue) ────────────────────────
  // Per-week Olive data: use the entry whose weekOf matches; null if missing.
  const oliveSeries = weekStarts.map((w) => ({ week: w, entry: findOliveWeek(olive, w) }));

  const bookingsSeries: WeekValue<number | null>[] = oliveSeries.map(({ week, entry }) => ({
    week,
    value: entry ? totalBookings(entry) : null,
  }));

  const totalRevenueSeries: WeekValue<number | null>[] = oliveSeries.map(({ week, entry }) => ({
    week,
    value: entry ? oliveTotalRevenue(entry) : null,
  }));

  // ── Conversion Rate (site-wide + per-source) ──────────────────────────
  const conversionRateSeries = buildSeries<number | null>(weekStarts, (w) => {
    const oliveWeek = findOliveWeek(olive, w);
    if (!oliveWeek) return null;
    const bookings = totalBookings(oliveWeek);
    const users = windsor.weeklyUniques.get(w) ?? 0;
    return safeDiv(bookings, users);
  });
  const conversionRatePY = (() => {
    const pyOlive = findOliveWeek(olive, priorYearWeek);
    if (!pyOlive) return null;
    const users = windsorPriorYear.weeklyUniques.get(priorYearWeek) ?? 0;
    return safeDiv(totalBookings(pyOlive), users);
  })();

  // Per-source conv rate (current week only — sub-lines are snapshot)
  const currentRange = weekRange(weekOf);
  const currentOlive = findOliveWeek(olive, weekOf);
  const ga4SourceUsers = ga4UsersBySource(windsor.ga4, currentRange.start, currentRange.end);
  const conversionRateBySource: Record<string, number> = {};
  const conversionCountBySource: Record<string, number> = {};
  if (currentOlive) {
    for (const src of ['googleAds', 'metaAds', 'organic', 'direct'] as BookingSource[]) {
      const rate = safeDiv(currentOlive.bookings[src], ga4SourceUsers[src]);
      conversionRateBySource[src] = rate ?? 0;
      conversionCountBySource[src] = currentOlive.bookings[src];
    }
  }

  // ── Cost Per Booking (blended + Google + Meta) ────────────────────────
  const costPerBookingSeries = buildSeries<number | null>(weekStarts, (w) => {
    const { start, end } = weekRange(w);
    const oliveWeek = findOliveWeek(olive, w);
    if (!oliveWeek) return null;
    const bookings = totalBookings(oliveWeek);
    const spend = sumGoogleAdsCost(windsor.googleAds, start, end) + sumMetaSpend(windsor.meta, start, end);
    return safeDiv(spend, bookings);
  });
  const costPerBookingPY = (() => {
    const pyOlive = findOliveWeek(olive, priorYearWeek);
    if (!pyOlive) return null;
    const bookings = totalBookings(pyOlive);
    const spend =
      sumGoogleAdsCost(windsorPriorYear.googleAds, pyRange.start, pyRange.end) +
      sumMetaSpend(windsorPriorYear.meta, pyRange.start, pyRange.end);
    return safeDiv(spend, bookings);
  })();

  const costPerBookingBySource: Record<string, number> = {};
  if (currentOlive) {
    const googleSpend = sumGoogleAdsCost(windsor.googleAds, currentRange.start, currentRange.end);
    const metaSpend = sumMetaSpend(windsor.meta, currentRange.start, currentRange.end);
    costPerBookingBySource.googleAds = safeDiv(googleSpend, currentOlive.bookings.googleAds) ?? 0;
    costPerBookingBySource.metaAds = safeDiv(metaSpend, currentOlive.bookings.metaAds) ?? 0;
  }

  // ── Total Booking Value (total + pro-rated per-source) ────────────────
  const totalBookingValuePY = (() => {
    const pyOlive = findOliveWeek(olive, priorYearWeek);
    return pyOlive ? oliveTotalRevenue(pyOlive) : null;
  })();

  const totalBookingValueBySource: Record<string, number> = {};
  if (currentOlive) {
    // avgBookingValue is entered directly by the operator now — pro-rate uses it straight.
    const avg = currentOlive.avgBookingValue;
    for (const src of ['googleAds', 'metaAds', 'organic', 'direct'] as BookingSource[]) {
      totalBookingValueBySource[src] = Math.round(avg * currentOlive.bookings[src]);
    }
  }

  // ── ROAS ──────────────────────────────────────────────────────────────
  const roasSeries = buildSeries<number | null>(weekStarts, (w) => {
    const { start, end } = weekRange(w);
    const oliveWeek = findOliveWeek(olive, w);
    if (!oliveWeek) return null;
    const spend = sumGoogleAdsCost(windsor.googleAds, start, end) + sumMetaSpend(windsor.meta, start, end);
    return safeDiv(oliveTotalRevenue(oliveWeek), spend);
  });
  const roasPY = (() => {
    const pyOlive = findOliveWeek(olive, priorYearWeek);
    if (!pyOlive) return null;
    const spend =
      sumGoogleAdsCost(windsorPriorYear.googleAds, pyRange.start, pyRange.end) +
      sumMetaSpend(windsorPriorYear.meta, pyRange.start, pyRange.end);
    return safeDiv(oliveTotalRevenue(pyOlive), spend);
  })();

  // ── Assemble ──────────────────────────────────────────────────────────
  return {
    generatedAt: new Date().toISOString(),
    weekOf: weekRange(weekOf),
    metrics: {
      qualifiedLeads: metricBasic(qualifiedLeadsSeries, qualifiedLeadsPY),
      totalVisitors: metricWithSources(
        metricBasic(visitorsSeries, visitorsPY),
        visitorsTopSources,
      ),
      conversionRate: metricWithSources(
        metricBasic(conversionRateSeries, conversionRatePY),
        conversionRateBySource,
        conversionCountBySource,
      ),
      googleAdsSpend: metricBasic(googleAdsSpendSeries, googleAdsSpendPY),
      metaAdsSpend: metricBasic(metaSpendSeries, metaSpendPY),
      costPerBooking: metricWithSources(
        metricBasic(costPerBookingSeries, costPerBookingPY),
        costPerBookingBySource,
      ),
      totalBookingValue: metricWithSources(
        metricBasic(totalRevenueSeries, totalBookingValuePY),
        totalBookingValueBySource,
      ),
      roas: metricBasic(roasSeries, roasPY),
    },
  };
}
