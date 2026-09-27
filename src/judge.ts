// The contradiction judge, using GBrain's own prompt builder and verdict
// parser so every verdict here is byte-compatible with GBrain's probe.
import {
  buildJudgePrompt,
  parseJudgeJSON,
  normalizeVerdict,
  DEFAULT_MAX_PAIR_CHARS,
} from "../../gbrain/src/core/eval-contradictions/judge.ts";
import { chat, type Endpoint } from "./llm.ts";
import { getPage, putVerdict, type Pair } from "./store.ts";

/**
 * Prompt versions. "2" is GBrain's shipped PROMPT_VERSION. The other two are
 * the demo edits, mirroring the preprint's edit classes:
 *  - "2-fmt": formatting only (rules unwrapped and numbered). Same meaning.
 *  - "3-sem": a real semantic change of the kind a release ships.
 */
export const PROMPT_VERSIONS = ["2", "2-fmt", "3-sem"] as const;
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];

function formattingOnly(p: string): string {
  const [head, rest] = p.split("\nRules:\n");
  const [rules, tail] = rest!.split("\nReply with JSON ONLY:");
  // Unwrap hard-wrapped bullets, then number them.
  const bullets = rules!
    .split("\n")
    .reduce<string[]>((acc, line) => {
      if (line.startsWith("- ")) acc.push(line.slice(2));
      else if (line.trim() && acc.length) acc[acc.length - 1] += " " + line.trim();
      return acc;
    }, [])
    .map((b, i) => `${i + 1}. ${b}`);
  return `${head}\nRules:\n${bullets.join("\n")}\n\nReply with JSON ONLY:${tail}`;
}

const SEMANTIC_RULES = [
  "- Revised policy (supersedes the rules above where they conflict):",
  "  a metric that went down by less than 10% is temporal_evolution, not",
  "  temporal_regression; and when only ONE side carries a date, never use",
  "  temporal_supersession: classify the difference as contradiction if the",
  "  claims conflict, otherwise no_contradiction.",
].join("\n");

export function renderPrompt(pair: Pair, version: PromptVersion): string {
  const a = getPage(pair.a_slug);
  const b = getPage(pair.b_slug);
  const base = buildJudgePrompt({
    query: pair.query,
    a: { slug: a.slug, text: a.text, effective_date: a.effective_date },
    b: { slug: b.slug, text: b.text, effective_date: b.effective_date },
    maxPairChars: DEFAULT_MAX_PAIR_CHARS,
  });
  if (version === "2") return base;
  if (version === "2-fmt") return formattingOnly(base);
  return base.replace("\nReply with JSON ONLY:", `\n${SEMANTIC_RULES}\n\nReply with JSON ONLY:`);
}

/** Judge one pair and persist the draw. Parse failures are stored as "error". */
export async function judge(ep: Endpoint, pair: Pair, version: PromptVersion, draw: number, modelLabel = ep.model) {
  const r = await chat(ep, renderPrompt(pair, version), { maxTokens: 300, json: true });
  let verdict = "error";
  let confidence: number | null = null;
  try {
    const v = normalizeVerdict(parseJudgeJSON(r.text));
    verdict = v.verdict;
    confidence = v.confidence;
  } catch {}
  putVerdict({
    pair_id: pair.pair_id, prompt_version: version, model: modelLabel, draw,
    verdict, confidence, raw: r.text, cost_usd: r.costUsd, provider: r.provider, latency_ms: r.latencyMs,
  });
  return { verdict, confidence, cost: r.costUsd, provider: r.provider };
}
