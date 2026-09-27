// Mirror the local ledger into Neon Postgres, isolated in its own schema
// (the database is shared with another project; nothing outside
// `certified_brain` is read or written).
// Usage: bun run scripts/sync-neon.ts
import { SQL } from "bun";
import { db } from "../src/store.ts";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing (put it in .env.local)");
const sql = new SQL(url);

await sql.unsafe(`
CREATE SCHEMA IF NOT EXISTS certified_brain;
CREATE TABLE IF NOT EXISTS certified_brain.pages (
  slug TEXT PRIMARY KEY, entity TEXT NOT NULL, title TEXT NOT NULL, effective_date TEXT, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS certified_brain.pairs (
  pair_id TEXT PRIMARY KEY, query TEXT NOT NULL, a_slug TEXT NOT NULL, b_slug TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS certified_brain.verdicts (
  pair_id TEXT NOT NULL, prompt_version TEXT NOT NULL, model TEXT NOT NULL, draw INTEGER NOT NULL,
  verdict TEXT NOT NULL, confidence REAL, cost_usd REAL, provider TEXT, latency_ms INTEGER, created_at TEXT,
  PRIMARY KEY (pair_id, prompt_version, model, draw));
CREATE TABLE IF NOT EXISTS certified_brain.certificates (
  id TEXT PRIMARY KEY, created_at TEXT, edit_kind TEXT NOT NULL, from_version TEXT NOT NULL, to_version TEXT NOT NULL,
  from_model TEXT NOT NULL, to_model TEXT NOT NULL, alpha REAL NOT NULL, delta REAL NOT NULL, estimand TEXT NOT NULL,
  report JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS certified_brain.infographics (
  id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), entity TEXT NOT NULL, variant TEXT NOT NULL,
  spec JSONB NOT NULL, prompt TEXT NOT NULL, image_url TEXT, parent_id TEXT, spec_model TEXT, facts JSONB);
`);

async function upsert(table: string, rows: Record<string, unknown>[], key: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const cols = Object.keys(chunk[0]!);
    const updates = cols.filter((c) => !key.split(",").includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    await sql`INSERT INTO ${sql(`certified_brain.${table}`)} ${sql(chunk)}
      ON CONFLICT (${sql.unsafe(key)}) DO UPDATE SET ${sql.unsafe(updates)}`;
  }
  console.log(`${table}: ${rows.length}`);
}

await upsert("pages", db.query("SELECT * FROM pages").all() as any[], "slug");
await upsert("pairs", db.query("SELECT * FROM pairs").all() as any[], "pair_id");
await upsert(
  "verdicts",
  db.query("SELECT pair_id, prompt_version, model, draw, verdict, confidence, cost_usd, provider, latency_ms, created_at FROM verdicts").all() as any[],
  "pair_id,prompt_version,model,draw",
);
await upsert(
  "certificates",
  (db.query("SELECT * FROM certificates").all() as any[]).map((r) => ({ ...r, report: JSON.parse(r.report) })),
  "id",
);
await sql.close();
