import 'dotenv/config';

// Windsor.ai proxies Google Ads, Meta, and GA4. HubSpot is pulled directly via
// its REST API — see src/fetchers/hubspot.ts.
//
// Docs: https://windsor.ai/api-documentation/
// Field names were confirmed by `npm run windsor:discover` + `npm run windsor:fetch`
// against the Bolt Farm account on 2026-04-19.

const BASE = 'https://connectors.windsor.ai';

export type WindsorRow = Record<string, string | number | null | undefined>;

interface WindsorResponse<T> {
  data?: T[];
  meta?: { total_count?: number; returned_count?: number };
}

interface WindsorQuery {
  connector: string;
  fields: string[];
  dateFrom: string;
  dateTo: string;
  accountId?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Meta returns numeric fields as strings ("spend":"257.06"). Normalize at the
// boundary so downstream code can trust the typed shape.
function coerceNumericStrings<T extends WindsorRow>(rows: T[], numericFields: string[]): T[] {
  return rows.map((row) => {
    const out: WindsorRow = { ...row };
    for (const f of numericFields) {
      const v = out[f];
      if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) {
        out[f] = Number(v);
      }
    }
    return out as T;
  });
}

async function fetchConnector<T extends WindsorRow>(q: WindsorQuery): Promise<T[]> {
  const apiKey = requireEnv('WINDSOR_API_KEY');
  const params = new URLSearchParams({
    api_key: apiKey,
    fields: q.fields.join(','),
    date_from: q.dateFrom,
    date_to: q.dateTo,
  });
  if (q.accountId) params.set('account_id', q.accountId);

  const url = `${BASE}/${q.connector}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Windsor ${q.connector} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as WindsorResponse<T>;
  return json.data ?? [];
}

// ── Google Ads ───────────────────────────────────────────────────────────

export interface GoogleAdsRow extends WindsorRow {
  date: string;
  campaign?: string;
  cost: number;
  conversions?: number;
  clicks?: number;
  impressions?: number;
}

export async function fetchGoogleAds(dateFrom: string, dateTo: string): Promise<GoogleAdsRow[]> {
  const rows = await fetchConnector<GoogleAdsRow>({
    connector: 'google_ads',
    fields: ['date', 'campaign', 'cost', 'conversions', 'clicks', 'impressions'],
    dateFrom,
    dateTo,
    accountId: process.env.WINDSOR_GOOGLE_ADS_ACCOUNT_ID,
  });
  return coerceNumericStrings(rows, ['cost', 'conversions', 'clicks', 'impressions']);
}

// ── Meta (Facebook) ──────────────────────────────────────────────────────

export interface MetaRow extends WindsorRow {
  date: string;
  campaign?: string;
  spend: number;
  conversions?: number;
  clicks?: number;
  impressions?: number;
}

export async function fetchMeta(dateFrom: string, dateTo: string): Promise<MetaRow[]> {
  const rows = await fetchConnector<MetaRow>({
    connector: 'facebook',
    fields: ['date', 'campaign', 'spend', 'conversions', 'clicks', 'impressions'],
    dateFrom,
    dateTo,
    accountId: process.env.WINDSOR_META_AD_ACCOUNT_ID,
  });
  const coerced = coerceNumericStrings(rows, ['spend', 'conversions', 'clicks', 'impressions']);

  // Business rule: exclude any Meta campaign whose name contains this
  // substring (case-insensitive). Default: "coaching" — those campaigns
  // belong to Bolt Coaching, not Bolt Farm Treehouse rentals.
  const excludePattern = (process.env.META_EXCLUDE_CAMPAIGN_PATTERN ?? 'coaching').toLowerCase();
  if (!excludePattern) return coerced;
  return coerced.filter((r) => !String(r.campaign ?? '').toLowerCase().includes(excludePattern));
}

// ── GA4 ─────────────────────────────────────────────────────────────────
// Note: field name is `totalusers` (lowercase), not `totalUsers`. Windsor
// normalizes GA4 dimension/metric names to lowercase.
// Rows are broken out by source/medium — sum across rows per day for site-wide
// visitors; group by source for card-3 per-source conversion rates.

export interface GA4Row extends WindsorRow {
  date: string;
  source?: string;
  medium?: string;
  hostname?: string;
  totalusers?: number;
  sessions?: number;
  conversions?: number;
}

// Returns the comma-separated list of hostnames to exclude from GA4 results.
// Set GA4_EXCLUDE_HOSTNAMES to filter out e.g. "explore.boltfarmtreehouse.com".
function excludedHostnames(): string[] {
  return (process.env.GA4_EXCLUDE_HOSTNAMES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function dropExcludedHosts<T extends WindsorRow>(rows: T[]): T[] {
  const excluded = excludedHostnames();
  if (excluded.length === 0) return rows;
  return rows.filter((r) => {
    const host = String(r.hostname ?? '').toLowerCase();
    return !excluded.includes(host);
  });
}

export async function fetchGA4(dateFrom: string, dateTo: string): Promise<GA4Row[]> {
  const rows = await fetchConnector<GA4Row>({
    connector: 'googleanalytics4',
    fields: ['date', 'source', 'medium', 'hostname', 'totalusers', 'sessions', 'conversions'],
    dateFrom,
    dateTo,
    accountId: process.env.WINDSOR_GA4_PROPERTY_ID,
  });
  return dropExcludedHosts(coerceNumericStrings(rows, ['totalusers', 'sessions', 'conversions']));
}

// Site-wide GA4 totals — query WITHOUT source/medium so `totalusers` is
// deduplicated per day. Summing the source/medium rows double-counts users
// who visited via multiple channels in the same day.
export interface GA4TotalsRow extends WindsorRow {
  date: string;
  hostname?: string;
  totalusers?: number;
  sessions?: number;
  conversions?: number;
}

export async function fetchGA4Totals(dateFrom: string, dateTo: string): Promise<GA4TotalsRow[]> {
  const rows = await fetchConnector<GA4TotalsRow>({
    connector: 'googleanalytics4',
    fields: ['date', 'hostname', 'totalusers', 'sessions', 'conversions'],
    dateFrom,
    dateTo,
    accountId: process.env.WINDSOR_GA4_PROPERTY_ID,
  });
  return dropExcludedHosts(coerceNumericStrings(rows, ['totalusers', 'sessions', 'conversions']));
}

// ── Combined fetch ──────────────────────────────────────────────────────

export type SourceResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

export interface WindsorBundle {
  googleAds: SourceResult<GoogleAdsRow>;
  meta: SourceResult<MetaRow>;
  ga4: SourceResult<GA4Row>;
}

function settle<T>(p: PromiseSettledResult<T[]>): SourceResult<T> {
  return p.status === 'fulfilled'
    ? { ok: true, rows: p.value }
    : { ok: false, error: p.reason instanceof Error ? p.reason.message : String(p.reason) };
}

export async function fetchWindsor(dateFrom: string, dateTo: string): Promise<WindsorBundle> {
  const [gAds, meta, ga4] = await Promise.allSettled([
    fetchGoogleAds(dateFrom, dateTo),
    fetchMeta(dateFrom, dateTo),
    fetchGA4(dateFrom, dateTo),
  ]);
  return {
    googleAds: settle(gAds),
    meta: settle(meta),
    ga4: settle(ga4),
  };
}
