// Load the committed seed snapshots into Postgres after provisioning Neon.
// Usage: npm run seed:db   (reads DATABASE_URL from .env.local)
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const seedDir = path.join(process.cwd(), "src", "data", "seed");

await sql`CREATE TABLE IF NOT EXISTS marketing_base (week_of text PRIMARY KEY, data jsonb NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS marketing_manual (week_of text PRIMARY KEY, input jsonb NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS traffic (id int PRIMARY KEY, data jsonb NOT NULL)`;

const weekFiles = (await readdir(path.join(seedDir, "weeks"))).filter(
  (f) => f.endsWith(".json") && f !== "index.json"
);
for (const f of weekFiles) {
  const data = JSON.parse(await readFile(path.join(seedDir, "weeks", f), "utf8"));
  const weekOf = data.weekOf.start;
  await sql`
    INSERT INTO marketing_base (week_of, data) VALUES (${weekOf}, ${JSON.stringify(data)})
    ON CONFLICT (week_of) DO UPDATE SET data = EXCLUDED.data`;
  console.log("seeded week", weekOf);
}

const traffic = JSON.parse(await readFile(path.join(seedDir, "traffic.json"), "utf8"));
await sql`
  INSERT INTO traffic (id, data) VALUES (1, ${JSON.stringify(traffic)})
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
console.log("seeded traffic");
console.log("Done.");
