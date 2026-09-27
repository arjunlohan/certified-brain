// Self-flip floor: how often the judge disagrees with itself on the same cell
// under the same definition. Per the preprint, no stratum can certify below it.
// Usage: bun run scripts/floor.ts [pinned|unpinned] [n=300]
import { judge } from "../src/judge.ts";
import { pool, teacher } from "../src/llm.ts";
import { db, getVerdict, type Pair } from "../src/store.ts";
import { seededShuffle } from "../vendor/sivm.ts";

const mode = process.argv[2] ?? "pinned";
const n = Number(process.argv[3] ?? 300);
const ep = teacher();
if (mode === "unpinned") ep.pinProvider = undefined;
const label = mode === "unpinned" ? `${ep.model}@any-host` : ep.model;

const pairs = seededShuffle(db.query("SELECT * FROM pairs ORDER BY pair_id").all() as Pair[], 7).slice(0, n);
const draws = mode === "unpinned" ? [0, 1] : [1];
for (const d of draws)
  await pool(pairs, 32, async (p) => {
    if (!getVerdict(p.pair_id, "2", label, d)) await judge(ep, p, "2", d, label);
  });

const byStratum = new Map<string, { n: number; flips: number }>();
let flips = 0, counted = 0;
for (const p of pairs) {
  const a = getVerdict(p.pair_id, "2", label, 0);
  const b = getVerdict(p.pair_id, "2", label, 1);
  if (!a || !b || a.verdict === "error") continue;
  const f = a.verdict === b.verdict ? 0 : 1;
  counted++; flips += f;
  const s = byStratum.get(a.verdict) ?? { n: 0, flips: 0 };
  s.n++; s.flips += f; byStratum.set(a.verdict, s);
}
const hosts = db.query("SELECT provider, count(*) AS n FROM verdicts WHERE model=? GROUP BY provider").all(label);
console.log(JSON.stringify({ mode, model: label, cells: counted, selfFlip: flips / counted, hosts,
  byStratum: Object.fromEntries([...byStratum].map(([k, v]) => [k, { n: v.n, selfFlip: v.flips / v.n }])) }, null, 1));
