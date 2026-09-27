// Fill verdicts for every pair under one (prompt version, model, draw).
// Usage: bun run scripts/judge-all.ts [version=2] [draw=0] [limit]
// Resumable: pairs that already have this draw are skipped.
import { judge, PROMPT_VERSIONS, type PromptVersion } from "../src/judge.ts";
import { pool, teacher } from "../src/llm.ts";
import { db, type Pair } from "../src/store.ts";

const version = (process.argv[2] ?? "2") as PromptVersion;
const draw = Number(process.argv[3] ?? 0);
const limit = Number(process.argv[4] ?? 1e9);
if (!PROMPT_VERSIONS.includes(version)) throw new Error(`unknown version ${version}`);

const ep = teacher();
const todo = db
  .query(
    `SELECT p.* FROM pairs p WHERE NOT EXISTS (
       SELECT 1 FROM verdicts v WHERE v.pair_id=p.pair_id AND v.prompt_version=? AND v.model=? AND v.draw=?)
     ORDER BY p.pair_id LIMIT ?`,
  )
  .all(version, ep.model, draw, limit) as Pair[];

console.log(`judging ${todo.length} pairs under prompt ${version}, draw ${draw}, model ${ep.model}`);
let done = 0, cost = 0, errors = 0;
const providers = new Map<string, number>();
const t0 = Date.now();
await pool(todo, Number(process.env.CONCURRENCY ?? 32), async (pair) => {
  try {
    const r = await judge(ep, pair, version, draw);
    cost += r.cost;
    providers.set(r.provider, (providers.get(r.provider) ?? 0) + 1);
    if (r.verdict === "error") errors++;
  } catch (e) {
    errors++;
    console.error((e as Error).message.slice(0, 200));
  }
  if (++done % 250 === 0) console.log(`${done}/${todo.length}  $${cost.toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
});
console.log(`done ${done}, parse/transport errors ${errors}, cost $${cost.toFixed(4)}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("providers:", Object.fromEntries(providers));
