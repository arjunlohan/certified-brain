// Compare infographic spec writers on held-out entities:
//   teacher  Muse Spark 1.3 (Plate's spec model, via the gateway)
//   trained  Qwen3.5-9B LoRA on River, trained on the teacher's specs
//   base     Qwen3.5-9B untrained
// Metrics: valid Plate spec, grounding (printed values that appear in the notes),
// label overlap with the teacher. Writes ui/data/spec-eval.json.
import { readFileSync } from "node:fs";
import { parseSpec } from "../src/spec.ts";
import type { InfographicSpec } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";

const dir = new URL("../river/data/", import.meta.url).pathname;
const read = (f: string) => readFileSync(dir + f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const evalRows = read("spec-eval.jsonl") as { entity: string; variant: string; prompt: string; completion: string }[];
const id = (r: { entity: string; variant: string }) => `${r.entity}|${r.variant}`;
const outputs: Record<string, Map<string, string>> = {
  teacher: new Map(evalRows.map((r) => [id(r), r.completion])),
  trained: new Map(read("spec-9b-labels.jsonl").map((r: any) => [r.pair_id, r.text])),
  base: new Map(read("spec-9b-base-labels.jsonl").map((r: any) => [r.pair_id, r.text])),
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%$]/g, "");
function grounding(spec: InfographicSpec, notes: string) {
  const n = norm(notes);
  const values = spec.chart.data.map((d) => d.value).filter((v) => /\d/.test(v));
  const hits = values.filter((v) => n.includes(norm(v).replace(/^\$/, "")) || n.includes(norm(v)));
  return { values: values.length, grounded: hits.length };
}

const summary: Record<string, any> = {};
for (const [name, map] of Object.entries(outputs)) {
  let valid = 0, values = 0, grounded = 0, labelOverlap = 0, overlapN = 0;
  for (const r of evalRows) {
    const text = map.get(id(r));
    if (!text) continue;
    let spec: InfographicSpec;
    try { spec = parseSpec(text); } catch { continue; }
    valid++;
    const g = grounding(spec, r.prompt);
    values += g.values; grounded += g.grounded;
    const teacher = parseSpec(r.completion);
    const tl = new Set(teacher.chart.data.map((d) => norm(d.label)));
    const sl = spec.chart.data.map((d) => norm(d.label));
    if (sl.length) { labelOverlap += sl.filter((l) => tl.has(l)).length / Math.max(sl.length, tl.size); overlapN++; }
  }
  summary[name] = {
    prompts: evalRows.length, validSpecs: valid, validPct: valid / evalRows.length,
    groundedValuesPct: values ? grounded / values : 0, printedValues: values,
    labelOverlapWithTeacher: overlapN ? labelOverlap / overlapN : 0,
  };
}
console.log(JSON.stringify(summary, null, 1));
await Bun.write(new URL("../ui/data/spec-eval.json", import.meta.url).pathname, JSON.stringify(summary, null, 1));
