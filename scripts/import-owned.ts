// Import owned-judge labels from River into the ledger as a new judge model,
// so certification treats the swap as a definition edit V=(pi, M, theta) -> (pi, M', theta).
// Usage: bun run scripts/import-owned.ts [owned|base|dsv4] [draw]
import { readFileSync } from "node:fs";
import { normalizeVerdict, parseJudgeJSON } from "../../gbrain/src/core/eval-contradictions/judge.ts";
import { putVerdict } from "../src/store.ts";

const which = process.argv[2] ?? "owned";
const draw = Number(process.argv[3] ?? 0);
const LABELS: Record<string, string> = {
  owned: "river/qwen3.5-9b-sft",
  base: "river/qwen3.5-9b-base",
  dsv4: "river/deepseek-v4-flash-0731",
};
const label = LABELS[which] ?? `river/${which}`;
const path = new URL(`../river/data/${which}-labels${draw ? `-d${draw}` : ""}.jsonl`, import.meta.url).pathname;
let ok = 0, bad = 0;
for (const line of readFileSync(path, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { pair_id: string; text: string; latency_ms: number };
  let verdict = "error", confidence: number | null = null;
  try {
    const v = normalizeVerdict(parseJudgeJSON(r.text));
    verdict = v.verdict; confidence = v.confidence; ok++;
  } catch { bad++; }
  putVerdict({ pair_id: r.pair_id, prompt_version: "2", model: label, draw, verdict, confidence,
    raw: r.text, cost_usd: 0, provider: "river", latency_ms: r.latency_ms });
}
console.log(`${label}: imported ${ok} parsed, ${bad} unparseable`);
