import fs from 'node:fs/promises';
import path from 'node:path';

// Olive has no API. Operator types weekly numbers by hand into this single
// rolling file: booking count per source + an average booking value.
// Total revenue is derived: avgBookingValue × sum(bookings).

const OLIVE_FILE = path.resolve('data/olive/weeks.json');

export type BookingSource = 'googleAds' | 'metaAds' | 'organic' | 'direct';

export interface OliveWeek {
  weekOf: string;
  notes?: string;
  bookings: Record<BookingSource, number>;
  avgBookingValue: number;
}

const REQUIRED_SOURCES: BookingSource[] = ['googleAds', 'metaAds', 'organic', 'direct'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nonNegNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function validateWeek(data: unknown, where: string): OliveWeek {
  if (!data || typeof data !== 'object') throw new Error(`${where}: expected an object`);
  const obj = data as Record<string, unknown>;

  const weekOf = obj.weekOf;
  if (typeof weekOf !== 'string' || !ISO_DATE_RE.test(weekOf)) {
    throw new Error(`${where}: "weekOf" must be YYYY-MM-DD, got ${JSON.stringify(weekOf)}`);
  }

  const bookings = obj.bookings;
  if (!bookings || typeof bookings !== 'object') {
    throw new Error(`${where}: "bookings" must be an object with keys ${REQUIRED_SOURCES.join(', ')}`);
  }
  const bObj = bookings as Record<string, unknown>;
  const unknown = Object.keys(bObj).filter((k) => !REQUIRED_SOURCES.includes(k as BookingSource));
  if (unknown.length > 0) {
    throw new Error(`${where}: unknown source(s) ${unknown.join(', ')}. Allowed: ${REQUIRED_SOURCES.join(', ')}`);
  }

  const counts = {} as Record<BookingSource, number>;
  for (const src of REQUIRED_SOURCES) {
    const v = bObj[src];
    if (!nonNegNumber(v)) {
      throw new Error(`${where}: bookings.${src} must be a non-negative number, got ${JSON.stringify(v)}`);
    }
    counts[src] = v;
  }

  if (!nonNegNumber(obj.avgBookingValue)) {
    throw new Error(`${where}: "avgBookingValue" must be a non-negative number, got ${JSON.stringify(obj.avgBookingValue)}`);
  }

  return {
    weekOf,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    bookings: counts,
    avgBookingValue: obj.avgBookingValue,
  };
}

export interface OliveHistory {
  weeks: OliveWeek[];
}

export async function readOliveFile(filePath: string = OLIVE_FILE): Promise<OliveHistory> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`No Olive file at ${filePath}. Create it — see data/olive/README.md.`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filePath}: invalid JSON — ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { weeks?: unknown }).weeks)) {
    throw new Error(`${filePath}: top level must be { "weeks": [...] }`);
  }

  const rawWeeks = (parsed as { weeks: unknown[] }).weeks;
  const weeks = rawWeeks.map((w, i) => validateWeek(w, `${filePath} [weeks[${i}]]`));

  weeks.sort((a, b) => a.weekOf.localeCompare(b.weekOf));

  const seen = new Set<string>();
  for (const w of weeks) {
    if (seen.has(w.weekOf)) throw new Error(`${filePath}: duplicate week ${w.weekOf}`);
    seen.add(w.weekOf);
  }

  return { weeks };
}

export async function fetchOliveLatest(): Promise<OliveWeek> {
  const { weeks } = await readOliveFile();
  const latest = weeks[weeks.length - 1];
  if (!latest) throw new Error(`${OLIVE_FILE}: "weeks" array is empty`);
  return latest;
}

export async function fetchOliveWeek(weekOf: string): Promise<OliveWeek> {
  const { weeks } = await readOliveFile();
  const match = weeks.find((w) => w.weekOf === weekOf);
  if (!match) throw new Error(`${OLIVE_FILE}: no entry for weekOf=${weekOf}`);
  return match;
}

export async function fetchOliveHistory(): Promise<OliveWeek[]> {
  const { weeks } = await readOliveFile();
  return weeks;
}

export function totalBookings(week: OliveWeek): number {
  return Object.values(week.bookings).reduce((a, b) => a + b, 0);
}

export function totalRevenue(week: OliveWeek): number {
  return totalBookings(week) * week.avgBookingValue;
}
