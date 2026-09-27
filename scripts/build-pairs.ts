// Emulate GBrain's contradiction probe pair generation: for each query take the
// top-K retrieved chunks and form every cross-page pair among them
// (runner.ts: "cross_slug_chunks across the top-K results"). Retrieval here is
// a keyword scorer over the local corpus; the pair shape is what matters.
import { createHash } from "node:crypto";
import { db, type Page } from "../src/store.ts";

const K = Number(process.env.TOP_K ?? 6);
const pages = db.query("SELECT * FROM pages").all() as Page[];
const entities = [...new Set(pages.map((p) => p.entity))];

const tok = (s: string) => s.toLowerCase().split(/[^a-z0-9$%]+/).filter((w) => w.length > 2);
const docTokens = new Map(pages.map((p) => [p.slug, new Set(tok(`${p.title} ${p.text}`))]));
const df = new Map<string, number>();
for (const set of docTokens.values()) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);

function search(q: string): Page[] {
  const qt = [...new Set(tok(q))];
  return pages
    .map((p) => {
      const d = docTokens.get(p.slug)!;
      const score = qt.reduce((s, w) => s + (d.has(w) ? Math.log(pages.length / (df.get(w) ?? 1)) : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, K)
    .map((x) => x.p);
}

const templates = [
  (n: string) => `What is the current status of ${n}?`,
  (n: string) => `Who owns ${n} and what changed recently?`,
  (n: string) => `${n} metrics and numbers over time`,
  (n: string) => `Did we renew or cancel anything with ${n}?`,
];

const insert = db.query("INSERT OR IGNORE INTO pairs (pair_id, query, a_slug, b_slug) VALUES (?,?,?,?)");
let raw = 0;
for (const e of entities) {
  const name = pages.find((p) => p.entity === e)!.title.split(":")[0]!;
  for (const t of templates) {
    const q = t(name);
    const hits = search(q);
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const [a, b] = [hits[i]!.slug, hits[j]!.slug].sort();
        const id = createHash("sha256").update(`${a}\u0000${b}`).digest("hex").slice(0, 16);
        insert.run(id, q, a, b);
        raw++;
      }
  }
}
const { n } = db.query("SELECT count(*) AS n FROM pairs").get() as { n: number };
console.log(`queries: ${entities.length * templates.length}, raw pairs: ${raw}, unique pairs: ${n}`);
