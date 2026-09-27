// Local ledger. Mirrors the shape of GBrain's eval_contradictions_cache
// (pair hashes x model x prompt_version) but keeps the pair text and every
// draw, which certification needs and GBrain's cache does not store.
import { Database } from "bun:sqlite";

export const db = new Database(new URL("../data/brain.db", import.meta.url).pathname, { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;");

db.exec(`
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY, entity TEXT NOT NULL, title TEXT NOT NULL,
  effective_date TEXT, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pairs (
  pair_id TEXT PRIMARY KEY, query TEXT NOT NULL,
  a_slug TEXT NOT NULL, b_slug TEXT NOT NULL
);
-- One row per judge call. (prompt_version, model) is GBrain's cache key axis;
-- draw > 0 rows are fresh re-draws used for certification and floors.
CREATE TABLE IF NOT EXISTS verdicts (
  pair_id TEXT NOT NULL, prompt_version TEXT NOT NULL, model TEXT NOT NULL,
  draw INTEGER NOT NULL, verdict TEXT NOT NULL, confidence REAL,
  raw TEXT, cost_usd REAL, provider TEXT, latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (pair_id, prompt_version, model, draw)
);
CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edit_kind TEXT NOT NULL, from_version TEXT NOT NULL, to_version TEXT NOT NULL,
  from_model TEXT NOT NULL, to_model TEXT NOT NULL,
  alpha REAL NOT NULL, delta REAL NOT NULL, estimand TEXT NOT NULL,
  report TEXT NOT NULL
);
`);

export interface Page { slug: string; entity: string; title: string; effective_date: string | null; text: string }
export interface Pair { pair_id: string; query: string; a_slug: string; b_slug: string }

export function getPage(slug: string): Page {
  return db.query("SELECT * FROM pages WHERE slug = ?").get(slug) as Page;
}

export function getVerdict(pairId: string, version: string, model: string, draw = 0) {
  return db
    .query("SELECT verdict, confidence FROM verdicts WHERE pair_id=? AND prompt_version=? AND model=? AND draw=?")
    .get(pairId, version, model, draw) as { verdict: string; confidence: number } | null;
}

export function putVerdict(r: {
  pair_id: string; prompt_version: string; model: string; draw: number;
  verdict: string; confidence: number | null; raw: string; cost_usd: number; provider: string; latency_ms: number;
}) {
  db.query(
    `INSERT OR REPLACE INTO verdicts (pair_id, prompt_version, model, draw, verdict, confidence, raw, cost_usd, provider, latency_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(r.pair_id, r.prompt_version, r.model, r.draw, r.verdict, r.confidence, r.raw, r.cost_usd, r.provider, r.latency_ms);
}
