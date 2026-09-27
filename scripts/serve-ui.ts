// Ledger UI and Brain Chat at http://localhost:4173 (/ and /chat.html)
import { ask, EDITS, entities } from "../src/ask.ts";
import { generate, type Writer } from "../src/generate.ts";
import { db, getPage } from "../src/store.ts";

const TEACHER = "deepseek/deepseek-v4-flash-0731";
// Target judge for each change shown in the web app's drill-down.
const TARGETS: Record<string, { version: string; model: string }> = {
  "2-fmt": { version: "2-fmt", model: TEACHER },
  "3-sem": { version: "3-sem", model: TEACHER },
  "9b-sft": { version: "2", model: "river/qwen3.5-9b-sft" },
  "9b-base": { version: "2", model: "river/qwen3.5-9b-base" },
  "dsv4": { version: "2", model: "river/deepseek-v4-flash-0731" },
  "dsv4-sft": { version: "2", model: "river/deepseek-v4-flash-sft" },
};

// Sample cached verdicts in one stratum (cached value) whose verdict changed (or not) under the new judge.
function flips(to: string, cached: string, changed: boolean, limit = 4) {
  const t = TARGETS[to];
  if (!t) throw new Error(`unknown change ${to}`);
  const rows = db.query(
    `SELECT p.pair_id, p.a_slug, p.b_slug, o.verdict AS old, n.verdict AS new, n.confidence
     FROM verdicts o JOIN verdicts n ON n.pair_id = o.pair_id AND n.prompt_version = ? AND n.model = ? AND n.draw = 0
     JOIN pairs p ON p.pair_id = o.pair_id
     WHERE o.prompt_version = '2' AND o.model = ? AND o.draw = 0 AND o.verdict = ? AND (o.verdict != n.verdict) = ?
     ORDER BY random() LIMIT ?`,
  ).all(t.version, t.model, TEACHER, cached, changed ? 1 : 0, limit) as { pair_id: string; a_slug: string; b_slug: string; old: string; new: string; confidence: number | null }[];
  return rows.map((r) => ({ ...r, a: getPage(r.a_slug), b: getPage(r.b_slug) }));
}


const root = new URL("../ui/", import.meta.url).pathname;
Bun.serve({
  port: Number(process.env.PORT ?? 4173),
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/entities") return Response.json({ entities: entities(), edits: EDITS });
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const b = (await req.json()) as { entity: string; question: string; edit?: string; alpha?: number };
      try {
        return Response.json(await ask(b.entity, b.question, b.edit, b.alpha));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    if (url.pathname === "/api/generate" && req.method === "POST") {
      const b = (await req.json()) as { entity?: string; brief?: string; writer: Writer };
      try {
        return Response.json(await generate(b));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    if (url.pathname === "/api/flips") {
      const q = url.searchParams;
      try {
        return Response.json(flips(q.get("to") ?? "3-sem", q.get("cached") ?? "no_contradiction", q.get("changed") !== "0"));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 400 });
      }
    }
    const file = Bun.file(root + (url.pathname === "/" ? "index.html" : url.pathname.slice(1)));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
console.log("ledger UI on http://localhost:4173 · Brain Chat on http://localhost:4173/chat.html");
