// Rank entity x edit combos where certified reuse clearly wins, without any
// answer calls: per-policy judge calls and stale verdicts, same logic as src/ask.ts.
import { certifyOnce, loadCells, type Side } from "../src/certify.ts";
import { EDITS, entities, TEACHER } from "../src/ask.ts";
import { db } from "../src/store.ts";

const FROM: Side = { version: "2", model: TEACHER };
const alpha = 0.1;
const rows: any[] = [];
for (const [edit, e] of Object.entries(EDITS)) {
  const cells = loadCells(FROM, e.to);
  const report = await certifyOnce(cells, { from: FROM, to: e.to, alpha, delta: 0.1, estimand: "presented", stratifier: "value", seed: 1 });
  const reused = new Set(report.reusedIds);
  const byId = new Map(cells.map((c: any) => [c.pairId, c]));
  const cost = (db.query("SELECT avg(cost_usd) c FROM verdicts WHERE prompt_version=? AND model=? AND draw=0").get(e.to.version, e.to.model) as { c: number }).c || 0;
  for (const ent of entities()) {
    const pairs = db.query("SELECT pair_id FROM pairs WHERE a_slug LIKE ? AND b_slug LIKE ?").all(`${ent}/%`, `${ent}/%`) as { pair_id: string }[];
    const cs = pairs.map((p) => byId.get(p.pair_id)).filter(Boolean) as any[];
    if (!cs.length) continue;
    const reuseStale = cs.filter((c) => c.cached !== c.truth).length;
    const certCalls = cs.filter((c) => !reused.has(c.pairId)).length;
    const certStale = cs.filter((c) => reused.has(c.pairId) && c.cached !== c.truth).length;
    rows.push({ edit, entity: ent, stockCalls: cs.length, stockUsd: +(cs.length * cost).toFixed(5), reuseStale, certCalls, certUsd: +(certCalls * cost).toFixed(5), certStale, gap: reuseStale - certStale });
  }
}
rows.sort((a, b) => b.gap - a.gap || (a.certCalls / a.stockCalls) - (b.certCalls / b.stockCalls));
// A win: several stale answers avoided AND certified makes well under stock's calls.
const wins = rows.filter((r) => r.reuseStale >= 3 && r.certStale <= 1 && r.certCalls <= 0.6 * r.stockCalls);
for (const edit of Object.keys(EDITS)) {
  console.log(`\n== ${edit} (wins: certified <= 60% of stock calls)`);
  console.table(wins.filter((r) => r.edit === edit).slice(0, 8));
}
