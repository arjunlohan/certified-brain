// Run the certification grid for every edit and write ui/data/report.json.
// Usage: bun run scripts/certify.ts [runs=1000]
import { mkdirSync, writeFileSync } from "node:fs";
import { certifyOnce, loadCells, replicate, type CertifyOpts, type Side } from "../src/certify.ts";
import { db } from "../src/store.ts";

const runs = Number(process.argv[2] ?? 1000);
const TEACHER = process.env.TEACHER_MODEL ?? "deepseek/deepseek-v4-flash-0731";
const OWNED = process.env.OWNED_MODEL; // e.g. "river/qwen3.5-9b-sft" once Half 2 has labels

const edits: { name: string; kind: string; from: Side; to: Side }[] = [
  { name: "Formatting-only prompt edit", kind: "prompt", from: { version: "2", model: TEACHER }, to: { version: "2-fmt", model: TEACHER } },
  { name: "Semantic prompt edit", kind: "prompt", from: { version: "2", model: TEACHER }, to: { version: "3-sem", model: TEACHER } },
];
// Model swaps: same prompt, judge M -> M'. Cells are those the new judge labeled.
edits.push(
  { name: "Swap to owned 9B (trained)", kind: "model", from: { version: "2", model: TEACHER }, to: { version: "2", model: OWNED ?? "river/qwen3.5-9b-sft" } },
  { name: "Swap to 9B (untrained)", kind: "model", from: { version: "2", model: TEACHER }, to: { version: "2", model: "river/qwen3.5-9b-base" } },
  { name: "Same model, owned weights (River)", kind: "model", from: { version: "2", model: TEACHER }, to: { version: "2", model: "river/deepseek-v4-flash-0731" } },
  { name: "Same model, trained on River", kind: "model", from: { version: "2", model: TEACHER }, to: { version: "2", model: "river/deepseek-v4-flash-sft" } },
);

const insertCert = db.query(
  `INSERT OR REPLACE INTO certificates (id, edit_kind, from_version, to_version, from_model, to_model, alpha, delta, estimand, report)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
);

const results = [];
for (const e of edits) {
  const cells = loadCells(e.from, e.to);
  if (cells.length === 0) { console.log(`skip ${e.name}: no labels yet`); continue; }
  const cost = db
    .query("SELECT avg(cost_usd) AS c, avg(latency_ms) AS l FROM verdicts WHERE prompt_version=? AND model=? AND draw=0")
    .get(e.to.version, e.to.model) as { c: number; l: number };
  for (const stratifier of ["value", "value+confidence"] as const)
    for (const alpha of [0.05, 0.1, 0.2]) {
      const o: CertifyOpts = { from: e.from, to: e.to, alpha, delta: 0.1, estimand: "presented", stratifier, seed: 1 };
      const once = await certifyOnce(cells, o);
      delete once.reusedIds;
      const rep = await replicate(cells, o, runs);
      const id = `${e.to.version}|${e.to.model}|${stratifier}|a=${alpha}`;
      insertCert.run(id, e.kind, e.from.version, e.to.version, e.from.model, e.to.model, alpha, 0.1, "presented", JSON.stringify(once));
      results.push({ edit: e.name, kind: e.kind, stratifier, alpha, once, rep, costPerCall: cost.c, latencyMs: cost.l });
      console.log(
        `${e.name.padEnd(28)} ${stratifier.padEnd(16)} a=${alpha}  flip=${(once.populationFlipRate * 100).toFixed(1)}%  ` +
          `reuse=${(once.savings * 100).toFixed(1)}%  oracle=${once.oracleCalls}/${once.cells}  ` +
          `presErr=${(once.presentedError * 100).toFixed(2)}%  | reps: cert ${(rep.certRate * 100).toFixed(0)}% ` +
          `sav ${(rep.savingsMean * 100).toFixed(1)}% [${(rep.savingsP05 * 100).toFixed(1)}, ${(rep.savingsP95 * 100).toFixed(1)}] exceed ${rep.exceedances}/${rep.runs}`,
      );
    }
}
mkdirSync(new URL("../ui/data", import.meta.url).pathname, { recursive: true });
writeFileSync(new URL("../ui/data/report.json", import.meta.url).pathname, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));
console.log(`wrote ui/data/report.json (${results.length} configurations)`);
