// Brain Chat: answer a question about one entity after a definition change,
// under three cache policies, and report what each one cost and got wrong.
//   stock      GBrain today: the key includes prompt_version/model, so the
//              whole cache misses and every verdict is re-judged.
//   reuse_all  stock with the version check removed: every old verdict is
//              served, nothing re-judged, stale verdicts included.
//   certified  sIVM certificate over the whole cache (alpha, delta): reuse
//              the certified strata, re-judge sampled and refused cells.
import { certifyOnce, loadCells, type Side } from "./certify.ts";
import { db, type Page } from "./store.ts";

export const TEACHER = "deepseek/deepseek-v4-flash-0731";
export const EDITS: Record<string, { label: string; to: Side }> = {
  "3-sem": { label: "Semantic prompt edit", to: { version: "3-sem", model: TEACHER } },
  "2-fmt": { label: "Formatting-only prompt edit", to: { version: "2-fmt", model: TEACHER } },
  "swap-9b": { label: "Judge swap to owned 9B (River)", to: { version: "2", model: "river/qwen3.5-9b-sft" } },
};
const FROM: Side = { version: "2", model: TEACHER };

type Cell = { pairId: string; cached: string; confidence: number | null; truth: string };
const certCache = new Map<string, { reused: Set<string>; cells: Cell[]; report: any }>();

async function certificate(edit: string, alpha: number) {
  const key = `${edit}|${alpha}`;
  if (!certCache.has(key)) {
    const cells = loadCells(FROM, EDITS[edit]!.to);
    const report = await certifyOnce(cells, { from: FROM, to: EDITS[edit]!.to, alpha, delta: 0.1, estimand: "presented", stratifier: "value", seed: 1 });
    certCache.set(key, { reused: new Set(report.reusedIds), cells, report: { ...report, reusedIds: undefined } });
  }
  return certCache.get(key)!;
}

const avgCost = (side: Side) =>
  (db.query("SELECT avg(cost_usd) c, avg(latency_ms) l FROM verdicts WHERE prompt_version=? AND model=? AND draw=0").get(side.version, side.model) as { c: number; l: number });

export function entities(): string[] {
  return (db.query("SELECT DISTINCT entity FROM pages ORDER BY entity").all() as { entity: string }[]).map((r) => r.entity);
}

async function answer(question: string, pages: Page[], findings: string[]): Promise<string> {
  const prompt =
    `Answer the question in 2 to 3 sentences using only these company notes and the judge's verdicts on note pairs. ` +
    `Say which claim is current when notes conflict, and name any open contradiction.\n\n` +
    `Question: ${question}\n\nNotes:\n${pages.map((p) => `[${p.slug.split("/").pop()} · ${p.effective_date ?? "undated"}] ${p.text}`).join("\n")}\n\n` +
    `Judge verdicts:\n${findings.length ? findings.join("\n") : "(no conflicts flagged)"}`;
  const proc = Bun.spawn([new URL("../.venv/bin/python", import.meta.url).pathname, "river/chat.py", "deepseek-ai/DeepSeek-V4-Flash-0731"], {
    cwd: new URL("..", import.meta.url).pathname, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: process.env,
  });
  proc.stdin.write(JSON.stringify({ prompt }));
  proc.stdin.end();
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim() || "(no answer)";
}

export async function ask(entity: string, question: string, edit = "3-sem", alpha = 0.1) {
  const cert = await certificate(edit, alpha);
  const byId = new Map(cert.cells.map((c) => [c.pairId, c]));
  const pages = db.query("SELECT * FROM pages WHERE entity = ? ORDER BY effective_date IS NULL, effective_date, slug").all(entity) as Page[];
  const pairs = db
    .query("SELECT pair_id, a_slug, b_slug FROM pairs WHERE a_slug LIKE ? AND b_slug LIKE ?")
    .all(`${entity}/%`, `${entity}/%`) as { pair_id: string; a_slug: string; b_slug: string }[];
  const cells = pairs.map((p) => ({ ...p, cell: byId.get(p.pair_id) })).filter((p) => p.cell);

  const note = (slug: string) => slug.split("/").pop();
  const line = (p: (typeof cells)[number], verdict: string) => `- ${verdict}: ${note(p.a_slug)} vs ${note(p.b_slug)}`;
  const toCost = avgCost(EDITS[edit]!.to);
  const policy = (name: string, pick: (p: (typeof cells)[number]) => { verdict: string; fresh: boolean }) => {
    const used = cells.map((p) => ({ p, ...pick(p) }));
    const calls = used.filter((u) => u.fresh).length;
    const stale = used.filter((u) => u.verdict !== u.p.cell!.truth);
    return {
      name,
      calls,
      costUsd: calls * (toCost.c || 0),
      seconds: (calls * (toCost.l || 0)) / 1000 / 32,
      staleCount: stale.length,
      findings: used.filter((u) => u.verdict !== "no_contradiction").map((u) => ({
        text: line(u.p, u.verdict), stale: u.verdict !== u.p.cell!.truth, fresh: u.fresh,
      })),
      staleDetail: stale.map((u) => `${note(u.p.a_slug)} vs ${note(u.p.b_slug)}: served ${u.verdict}, current ${u.p.cell!.truth}`),
    };
  };
  const results = [
    policy("stock", (p) => ({ verdict: p.cell!.truth, fresh: true })),
    policy("reuse_all", (p) => ({ verdict: p.cell!.cached, fresh: false })),
    policy("certified", (p) =>
      cert.reused.has(p.pair_id) ? { verdict: p.cell!.cached, fresh: false } : { verdict: p.cell!.truth, fresh: true }),
  ];
  const answers = await Promise.all(results.map((r) => answer(question, pages, r.findings.map((f) => f.text))));
  results.forEach((r, i) => ((r as any).answer = answers[i]));

  const whole = cert.report;
  return {
    entity, question, edit: EDITS[edit]!.label, alpha, pairs: cells.length, results,
    brain: {
      cells: whole.cells,
      stock: { calls: whole.cells, costUsd: whole.cells * (toCost.c || 0), stale: 0 },
      reuse_all: { calls: 0, costUsd: 0, stale: Math.round(whole.populationFlipRate * whole.cells) },
      certified: {
        calls: whole.cells - whole.reused, costUsd: (whole.cells - whole.reused) * (toCost.c || 0),
        stale: Math.round(whole.presentedError * whole.cells), reusedPct: whole.savings,
      },
      metered: (toCost.c || 0) > 0,
    },
  };
}
