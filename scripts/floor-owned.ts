// Self-flip floor of the owned judge: draw 0 vs draw 1 from the same River
// checkpoint at T = 0 on the same cells. Writes ui/data/floor-owned.json.
import { db } from "../src/store.ts";

const label = process.argv[2] ?? "river/qwen3.5-9b-sft";
const mode = process.argv[3] ?? "owned";
const rows = db
  .query(
    `SELECT a.verdict AS v0, b.verdict AS v1 FROM verdicts a JOIN verdicts b
       ON b.pair_id = a.pair_id AND b.model = a.model AND b.prompt_version = a.prompt_version AND b.draw = 1
     WHERE a.model = ? AND a.prompt_version = '2' AND a.draw = 0 AND a.verdict != 'error'`,
  )
  .all(label) as { v0: string; v1: string }[];

const byStratum = new Map<string, { n: number; flips: number }>();
let flips = 0;
for (const r of rows) {
  const f = r.v0 === r.v1 ? 0 : 1;
  flips += f;
  const s = byStratum.get(r.v0) ?? { n: 0, flips: 0 };
  s.n++; s.flips += f; byStratum.set(r.v0, s);
}
const result = {
  mode, model: label, cells: rows.length, selfFlip: rows.length ? flips / rows.length : 0,
  hosts: [{ provider: "River checkpoint (owned weights)", n: rows.length * 2 }],
  byStratum: Object.fromEntries([...byStratum].map(([k, v]) => [k, { n: v.n, selfFlip: v.flips / v.n }])),
};
console.log(JSON.stringify(result, null, 1));
await Bun.write(new URL(`../ui/data/floor-${mode}.json`, import.meta.url).pathname, JSON.stringify(result, null, 1));
