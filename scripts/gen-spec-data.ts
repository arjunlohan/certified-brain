// Teacher data for the River spec writer: Muse Spark 1.3 (the studio's spec model)
// writes an infographic spec for every GBrain entity, twice (notes before the entity's
// median date, and all notes with the cached judge verdicts). Only specs that
// pass the studio's schema are kept. Writes river/data/spec-{train,eval}.jsonl.
import { mkdirSync, writeFileSync } from "node:fs";
import { chat, pool } from "../src/llm.ts";
import { parseSpec, specPrompt } from "../src/spec.ts";
import { db, type Page } from "../src/store.ts";

const TEACHER = "deepseek/deepseek-v4-flash-0731";
const muse = {
  baseUrl: "https://ai-gateway.vercel.sh/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  model: process.env.SPEC_TEACHER ?? "meta/muse-spark-1.3-contributor",
};

const entities = (db.query("SELECT DISTINCT entity FROM pages ORDER BY entity").all() as { entity: string }[]).map((r) => r.entity);
const findingsFor = (entity: string) =>
  (db
    .query(
      `SELECT p.a_slug, p.b_slug, v.verdict FROM pairs p JOIN verdicts v ON v.pair_id = p.pair_id
       WHERE v.model = ? AND v.prompt_version = '2' AND v.draw = 0 AND v.verdict != 'no_contradiction'
         AND p.a_slug LIKE ? AND p.b_slug LIKE ?`,
    )
    .all(TEACHER, `${entity}/%`, `${entity}/%`) as { a_slug: string; b_slug: string; verdict: string }[])
    .map((f) => `- ${f.verdict}: ${f.a_slug.split("/").pop()} vs ${f.b_slug.split("/").pop()}`);

const jobs = entities.flatMap((entity) => {
  const pages = db.query("SELECT * FROM pages WHERE entity = ? ORDER BY effective_date IS NULL, effective_date, slug").all(entity) as Page[];
  const dated = pages.filter((p) => p.effective_date).map((p) => p.effective_date!).sort();
  const median = dated[Math.floor(dated.length / 2)];
  const earlier = pages.filter((p) => p.effective_date && median && p.effective_date < median);
  return [
    ...(earlier.length >= 2 ? [{ entity, variant: "before", prompt: specPrompt(earlier) }] : []),
    { entity, variant: "current", prompt: specPrompt(pages, findingsFor(entity)) },
  ];
});
console.log(`${entities.length} entities, ${jobs.length} spec prompts, teacher ${muse.model}`);

let ok = 0, bad = 0, cost = 0;
const out = await pool(jobs, 12, async (j) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await chat(muse, j.prompt, { maxTokens: 6000, temperature: 0.3 });
      cost += r.costUsd;
      const spec = parseSpec(r.text);
      ok++;
      return { ...j, completion: JSON.stringify(spec) };
    } catch {}
  }
  bad++;
  return null;
});
const rows = out.filter(Boolean) as any[];
// Hold out whole entities for evaluation (every 6th), so eval prompts are unseen.
const evalEntities = new Set(entities.filter((_, i) => i % 6 === 0));
const dir = new URL("../river/data/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(dir + "spec-train.jsonl", rows.filter((r) => !evalEntities.has(r.entity)).map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(dir + "spec-eval.jsonl", rows.filter((r) => evalEntities.has(r.entity)).map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`valid specs ${ok}, failed ${bad}, teacher cost $${cost.toFixed(3)}; eval entities ${evalEntities.size}`);
