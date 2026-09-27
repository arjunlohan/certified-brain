// Export teacher verdicts (prompt v2) as SFT data for the owned judge, with a
// disjoint split: pairs used for training never enter the certification set.
// Writes river/data/{train,certify}.jsonl
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseJudgeJSON } from "../../gbrain/src/core/eval-contradictions/judge.ts";
import { renderPrompt } from "../src/judge.ts";
import { db, type Pair } from "../src/store.ts";

const TEACHER = process.env.TEACHER_MODEL ?? "deepseek/deepseek-v4-flash-0731";
const TRAIN_N = Number(process.env.TRAIN_N ?? 1500);

const rows = db
  .query(
    `SELECT p.*, v.raw FROM pairs p JOIN verdicts v ON v.pair_id=p.pair_id
     WHERE v.prompt_version='2' AND v.model=? AND v.draw=0 AND v.verdict!='error'`,
  )
  .all(TEACHER) as (Pair & { raw: string })[];

// Deterministic split by hash so reruns agree.
const bucket = (id: string) => parseInt(createHash("sha256").update("split:" + id).digest("hex").slice(0, 8), 16);
rows.sort((a, b) => bucket(a.pair_id) - bucket(b.pair_id));

const canon = (raw: string) => {
  const v = parseJudgeJSON(raw) as Record<string, unknown>;
  return JSON.stringify({
    verdict: v.verdict, severity: v.severity, axis: v.axis ?? "",
    confidence: v.confidence, resolution_kind: v.resolution_kind ?? null,
  });
};

const out = (r: (typeof rows)[number]) => JSON.stringify({ pair_id: r.pair_id, prompt: renderPrompt(r, "2"), completion: canon(r.raw) });
const dir = new URL("../river/data/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
writeFileSync(dir + "train.jsonl", rows.slice(0, TRAIN_N).map(out).join("\n") + "\n");
writeFileSync(dir + "certify.jsonl", rows.slice(TRAIN_N).map(out).join("\n") + "\n");
const dist = (xs: typeof rows) => Object.fromEntries(
  [...xs.reduce((m, r) => m.set(JSON.parse(canon(r.raw)).verdict, (m.get(JSON.parse(canon(r.raw)).verdict) ?? 0) + 1), new Map())],
);
console.log(`train ${TRAIN_N}`, dist(rows.slice(0, TRAIN_N)));
console.log(`certify ${rows.length - TRAIN_N}`, dist(rows.slice(TRAIN_N)));
