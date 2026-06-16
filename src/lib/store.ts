import { promises as fs } from "node:fs";
import path from "node:path";
import { applyManual } from "./metrics";
import { seedIndex, seedTraffic, seedWeeks } from "./seed";
import type {
  ManualWeekInput,
  TrafficData,
  WeekData,
  WeekIndex,
  WeekIndexEntry,
} from "./types";

/**
 * Two backends, chosen at runtime:
 *  - Postgres (Neon) when DATABASE_URL is set  → production persistence.
 *  - Local files + seed snapshots otherwise     → zero-config dev / preview.
 *
 * Reads always compose: base week (auto-pulled or seed) + manual overlay.
 */
export interface Store {
  getMarketingIndex(): Promise<WeekIndex>;
  getMarketingWeek(weekOf: string): Promise<WeekData | null>;
  getManualInput(weekOf: string): Promise<ManualWeekInput | null>;
  saveManualInput(input: ManualWeekInput): Promise<void>;
  upsertMarketingBase(week: WeekData): Promise<void>;
  getTraffic(): Promise<TrafficData>;
  saveTraffic(data: TrafficData): Promise<void>;
}

const hasDb = !!process.env.DATABASE_URL;

function buildIndex(weekStarts: string[]): WeekIndex {
  const known = new Map<string, WeekIndexEntry>();
  for (const e of seedIndex.weeks) known.set(e.weekOf, e);
  const weeks = [...new Set(weekStarts)]
    .map((w) => known.get(w) ?? { weekOf: w, start: w, end: addDays(w, 6) })
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  return { weeks, latest: weeks.length ? weeks[weeks.length - 1].weekOf : seedIndex.latest };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── File / seed backend ──────────────────────────────────────
const STORE_DIR = path.join(process.cwd(), "data", "store");

class FileStore implements Store {
  private async readJson<T>(rel: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(STORE_DIR, rel), "utf8")) as T;
    } catch {
      return null;
    }
  }
  private async writeJson(rel: string, value: unknown): Promise<void> {
    const file = path.join(STORE_DIR, rel);
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value, null, 2));
    } catch (err) {
      throw new Error(
        "Cannot persist data without a database. Set DATABASE_URL (Neon Postgres) " +
          "for production. Underlying error: " +
          (err as Error).message
      );
    }
  }

  private async baseWeek(weekOf: string): Promise<WeekData | null> {
    return (await this.readJson<WeekData>(`base/${weekOf}.json`)) ?? seedWeeks[weekOf] ?? null;
  }

  async getMarketingIndex(): Promise<WeekIndex> {
    const localBases = (await this.readJson<string[]>("base/_index.json")) ?? [];
    return buildIndex([...Object.keys(seedWeeks), ...localBases]);
  }
  async getMarketingWeek(weekOf: string): Promise<WeekData | null> {
    const base = await this.baseWeek(weekOf);
    if (!base) return null;
    return applyManual(base, await this.getManualInput(weekOf));
  }
  async getManualInput(weekOf: string): Promise<ManualWeekInput | null> {
    return this.readJson<ManualWeekInput>(`manual/${weekOf}.json`);
  }
  async saveManualInput(input: ManualWeekInput): Promise<void> {
    await this.writeJson(`manual/${input.weekOf}.json`, { ...input, updatedAt: new Date().toISOString() });
  }
  async upsertMarketingBase(week: WeekData): Promise<void> {
    await this.writeJson(`base/${week.weekOf.start}.json`, week);
    const idx = new Set((await this.readJson<string[]>("base/_index.json")) ?? []);
    idx.add(week.weekOf.start);
    await this.writeJson("base/_index.json", [...idx]);
  }
  async getTraffic(): Promise<TrafficData> {
    return (await this.readJson<TrafficData>("traffic.json")) ?? seedTraffic;
  }
  async saveTraffic(data: TrafficData): Promise<void> {
    await this.writeJson("traffic.json", data);
  }
}

// ── Postgres (Neon) backend ──────────────────────────────────
class PostgresStore implements Store {
  private ready: Promise<void> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sql: any;

  private async init() {
    if (!this.ready) {
      this.ready = (async () => {
        const { neon } = await import("@neondatabase/serverless");
        this.sql = neon(process.env.DATABASE_URL!);
        await this.sql`CREATE TABLE IF NOT EXISTS marketing_base (week_of text PRIMARY KEY, data jsonb NOT NULL)`;
        await this.sql`CREATE TABLE IF NOT EXISTS marketing_manual (week_of text PRIMARY KEY, input jsonb NOT NULL)`;
        await this.sql`CREATE TABLE IF NOT EXISTS traffic (id int PRIMARY KEY, data jsonb NOT NULL)`;
      })();
    }
    return this.ready;
  }

  private async baseWeek(weekOf: string): Promise<WeekData | null> {
    await this.init();
    const rows = await this.sql`SELECT data FROM marketing_base WHERE week_of = ${weekOf}`;
    return (rows[0]?.data as WeekData) ?? seedWeeks[weekOf] ?? null;
  }

  async getMarketingIndex(): Promise<WeekIndex> {
    await this.init();
    const rows = await this.sql`SELECT week_of FROM marketing_base`;
    const dbWeeks = rows.map((r: { week_of: string }) => r.week_of);
    return buildIndex([...Object.keys(seedWeeks), ...dbWeeks]);
  }
  async getMarketingWeek(weekOf: string): Promise<WeekData | null> {
    const base = await this.baseWeek(weekOf);
    if (!base) return null;
    return applyManual(base, await this.getManualInput(weekOf));
  }
  async getManualInput(weekOf: string): Promise<ManualWeekInput | null> {
    await this.init();
    const rows = await this.sql`SELECT input FROM marketing_manual WHERE week_of = ${weekOf}`;
    return (rows[0]?.input as ManualWeekInput) ?? null;
  }
  async saveManualInput(input: ManualWeekInput): Promise<void> {
    await this.init();
    const payload = { ...input, updatedAt: new Date().toISOString() };
    await this.sql`
      INSERT INTO marketing_manual (week_of, input) VALUES (${input.weekOf}, ${JSON.stringify(payload)})
      ON CONFLICT (week_of) DO UPDATE SET input = EXCLUDED.input`;
  }
  async upsertMarketingBase(week: WeekData): Promise<void> {
    await this.init();
    await this.sql`
      INSERT INTO marketing_base (week_of, data) VALUES (${week.weekOf.start}, ${JSON.stringify(week)})
      ON CONFLICT (week_of) DO UPDATE SET data = EXCLUDED.data`;
  }
  async getTraffic(): Promise<TrafficData> {
    await this.init();
    const rows = await this.sql`SELECT data FROM traffic WHERE id = 1`;
    return (rows[0]?.data as TrafficData) ?? seedTraffic;
  }
  async saveTraffic(data: TrafficData): Promise<void> {
    await this.init();
    await this.sql`
      INSERT INTO traffic (id, data) VALUES (1, ${JSON.stringify(data)})
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
  }
}

export const store: Store = hasDb ? new PostgresStore() : new FileStore();
