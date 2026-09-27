// Before/after infographic of one GBrain entity, built with Plate's spec compiler
// and Hy Image 3.5 (GMI Cloud), with the spec written by DeepSeek-V4-Flash on River.
//
//   before: spec from what the brain held before the correcting notes arrived
//           -> Hy text-to-image
//   after:  the same spec updated with the current facts, using the teacher's
//           cached verdicts (supersessions, contradictions) for this entity
//           -> Hy image-to-image edit of "before", changing only what moved
//           -> plus a full text-to-image re-render, for comparison
//
// Usage: bun run scripts/infographic.ts [entity=customers/continental-retail-group] [cutoff=2025-12-01]
import { mkdirSync } from "node:fs";
import { SQL } from "bun";
import { compileInfographic, infographicSpecSchema, type InfographicSpec } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";
import { generateHyImage } from "../../gmi-hackathon-infographic-agent/agent/lib/gmi.ts";
import { db, type Page } from "../src/store.ts";

const entity = process.argv[2] ?? "customers/continental-retail-group";
const cutoff = process.argv[3] ?? "2025-12-01";
const TEACHER = "deepseek/deepseek-v4-flash-0731";
const SPEC_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731";

const pages = (db.query("SELECT * FROM pages WHERE entity = ? ORDER BY slug").all(entity) as Page[]);
const dated = (p: Page) => p.effective_date ?? "undated";
const earlier = pages.filter((p) => p.effective_date && p.effective_date < cutoff);

// Teacher verdicts among this entity's pages: what the certified cache knows.
const findings = db
  .query(
    `SELECT p.a_slug, p.b_slug, v.verdict, v.raw FROM pairs p JOIN verdicts v ON v.pair_id = p.pair_id
     WHERE v.model = ? AND v.prompt_version = '2' AND v.draw = 0
       AND p.a_slug LIKE ? AND p.b_slug LIKE ? AND v.verdict != 'no_contradiction'`,
  )
  .all(TEACHER, `${entity}/%`, `${entity}/%`) as { a_slug: string; b_slug: string; verdict: string; raw: string }[];
const findingLines = findings.map((f) => {
  let axis = "";
  try { axis = JSON.parse(f.raw).axis ?? ""; } catch {}
  return `- ${f.verdict}: ${f.a_slug.split("/").pop()} vs ${f.b_slug.split("/").pop()}${axis ? ` (${axis})` : ""}`;
});

const notesBlock = (ps: Page[]) =>
  ps.map((p) => `[${p.slug.split("/").pop()} · ${dated(p)}] ${p.title}\n${p.text}`).join("\n\n");

const specShape = `Reply with ONE JSON object and nothing else, shaped exactly like:
{"format":"portrait","kicker":"ACCOUNT HEALTH","title":"2-5 words","accentWord":"one word from title","subtitle":"measure, scope, period",
 "chart":{"form":"column","data":[{"label":"Uptime","value":"93%","numeric":93}]},
 "callouts":[{"text":"true statement from the notes","anchor":"a data label"}],
 "style":{"preset":"clean_light"},"source":"Source: Northwind Robotics knowledge base","footnote":"one sentence"}
Rules: 4 to 6 data points, each a metric that appears in the notes (uptime, NPS, bots deployed, revenue forecast, team headcount, contract status as a value like "Renewed" or "Not renewed").
Every printed string must come from the notes. At most 2 callouts.`;

async function writeSpec(prompt: string): Promise<InfographicSpec> {
  const proc = Bun.spawn(["../certified-brain/.venv/bin/python", "river/chat.py", SPEC_MODEL], {
    cwd: new URL("..", import.meta.url).pathname, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: process.env,
  });
  proc.stdin.write(JSON.stringify({ prompt }));
  proc.stdin.end();
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const raw = JSON.parse(json);
  delete raw.fileName; // optional download name; the model often exceeds Plate's 3-word limit
  if (raw.chart?.unit === "optional") delete raw.chart.unit; // placeholder echoed from an earlier template
  return infographicSpecSchema.parse(raw);
}

const cacheFile = new URL(`../data/infographic-cache-${entity.replaceAll("/", "_")}.json`, import.meta.url).pathname;
const cache: Record<string, any> = (await Bun.file(cacheFile).exists()) ? await Bun.file(cacheFile).json() : {};
const saveCache = () => Bun.write(cacheFile, JSON.stringify(cache, null, 1));
console.log(`entity ${entity}: ${pages.length} notes, ${earlier.length} before ${cutoff}, ${findings.length} cached non-trivial verdicts`);

for (const k of ["before", "after"]) if (cache[k]?.chart?.unit === "optional") delete cache[k].chart.unit;
const before: InfographicSpec = cache.before ?? await writeSpec(
  `You design an account-health infographic for an internal company newsletter.\n` +
  `Use ONLY these notes (what the knowledge base held before ${cutoff}):\n\n${notesBlock(earlier)}\n\n${specShape}`,
);
cache.before = before; await saveCache();
const after: InfographicSpec = cache.after ?? await writeSpec(
  `Here is an infographic spec built from older notes:\n${JSON.stringify(before)}\n\n` +
  `Update it with the CURRENT facts. All notes, oldest first:\n\n${notesBlock(pages)}\n\n` +
  `The knowledge base's judge already classified these note pairs (newer claims supersede older ones):\n${findingLines.join("\n")}\n\n` +
  `Keep the same format, chart form, data labels, order and style. Change only values, the title if needed, and callouts whose facts changed. ` +
  `Values must reflect the most recent notes.\n${specShape}`,
);

cache.after = after; await saveCache();

// The edit instruction is the diff between the two specs: only what moved.
const changes: string[] = [];
before.chart.data.forEach((d) => {
  const n = after.chart.data.find((x) => x.label === d.label);
  if (n && n.value !== d.value) changes.push(`change the value "${d.value}" for "${d.label}" to "${n.value}"`);
});
if (before.title !== after.title) changes.push(`change the headline "${before.title}" to "${after.title}"`);
(after.callouts ?? []).forEach((c, i) => {
  const old = before.callouts?.[i];
  if (old && old.text !== c.text) changes.push(`replace the note "${old.text}" with "${c.text}"`);
});
console.log("changes:", changes);

const cBefore = compileInfographic(before);
const cAfter = compileInfographic(after);
const t0 = Date.now();
async function render(key: string, input: Parameters<typeof generateHyImage>[0], tries = 3) {
  if (cache[key]) return cache[key] as { url: string };
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const img = await generateHyImage(input);
      cache[key] = img; await saveCache();
      return img;
    } catch (e) { last = e; console.log(`${key} attempt ${i + 1} failed: ${(e as Error).message.slice(0, 120)}`); }
  }
  throw last;
}
const imgBefore = await render("imgBefore", { prompt: cBefore.prompt, size: cBefore.size as any, seed: 7 });
console.log(`before rendered ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const editPrompt = [
  `Edit the reference infographic. ${changes.map((c) => c[0]!.toUpperCase() + c.slice(1)).join(". ")}.`,
  "Keep everything else identical: layout, canvas size, colors, typography, illustration, and every other piece of text, spelled exactly as it is. Do not add any new text.",
].join("\n");
const [editRes, fullRes] = await Promise.allSettled([
  render("imgEdit", { prompt: editPrompt, size: cBefore.size as any, referenceImages: [imgBefore.url] }, 4),
  render("imgFull", { prompt: cAfter.prompt, size: cAfter.size as any, seed: 7 }),
]);
const imgEdit = editRes.status === "fulfilled" ? editRes.value : null;
const imgFull = fullRes.status === "fulfilled" ? fullRes.value : null;
if (!imgEdit) console.log("image-to-image edit failed after retries; recording the failure");
if (!imgFull) throw new Error("full re-render failed");
console.log(`after rendered ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const dir = new URL("../ui/data/img/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const slug = entity.replaceAll("/", "_");
const save = async (url: string, name: string) => {
  await Bun.write(`${dir}${slug}-${name}.png`, await (await fetch(url)).arrayBuffer());
  return `data/img/${slug}-${name}.png`;
};
const record = {
  entity, cutoff, specModel: `river/${SPEC_MODEL}`, imageModel: "hy-image-v3.5-preview", findings: findingLines, changes,
  before: { spec: before, image: await save(imgBefore.url, "before"), url: imgBefore.url },
  afterEdit: imgEdit ? { image: await save(imgEdit.url, "after-edit"), url: imgEdit.url, prompt: editPrompt } : { failed: "GMI Backend error (400) on reference edit", prompt: editPrompt },
  afterFull: { spec: after, image: await save(imgFull.url, "after-full"), url: imgFull.url },
};
await Bun.write(new URL("../ui/data/infographic.json", import.meta.url).pathname, JSON.stringify(record, null, 1));

if (process.env.DATABASE_URL_UNPOOLED) {
  const sql = new SQL(process.env.DATABASE_URL_UNPOOLED);
  const rows = [
    { id: `${slug}-before`, entity, variant: "before", spec: before, prompt: cBefore.prompt, image_url: imgBefore.url, parent_id: null, spec_model: record.specModel, facts: earlier.map((p) => p.slug) },
    { id: `${slug}-after-edit`, entity, variant: "after-edit", spec: after, prompt: editPrompt, image_url: imgEdit?.url ?? null, parent_id: `${slug}-before`, spec_model: record.specModel, facts: findingLines },
    { id: `${slug}-after-full`, entity, variant: "after-full", spec: after, prompt: cAfter.prompt, image_url: imgFull.url, parent_id: null, spec_model: record.specModel, facts: pages.map((p) => p.slug) },
  ];
  for (const r of rows)
    await sql`INSERT INTO certified_brain.infographics ${sql(r)} ON CONFLICT (id) DO UPDATE SET spec = EXCLUDED.spec, prompt = EXCLUDED.prompt, image_url = EXCLUDED.image_url, facts = EXCLUDED.facts, created_at = now()`;
  await sql.close();
  console.log("saved 3 rows to certified_brain.infographics");
}
console.log("wrote ui/data/infographic.json");
