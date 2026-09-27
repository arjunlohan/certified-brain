// Live A/B infographic on the infographic studio's own pipeline. The same material goes to two
// spec writers (Muse Spark on the gateway vs our Qwen3.5-9B trained on River), both prompted with
// the studio's planner instructions. Each spec then runs the studio's quality loop unchanged:
// compile, Hy Image 3.5 render, blind fact-check, fix by edit or re-render (up to six passes),
// with the QA run logged to the studio's store so its learned render policy improves.
import { readFileSync } from "node:fs";
import { chat } from "./llm.ts";
import { notesBlock } from "./spec.ts";
import { db, type Page } from "./store.ts";

const STUDIO = `${process.env.HOME}/Downloads/GitHub/gmi-hackathon-infographic-agent/.claude/worktrees/infographic-generator-eve-spark-0d911d`;
const { infographicSpecSchema, compileInfographic } = await import(`${STUDIO}/agent/lib/infographic.ts`);
const { z } = await import(`${STUDIO}/node_modules/zod/index.js`);

const TEACHER = "deepseek/deepseek-v4-flash-0731";
const SPEC_CKPT = "river://52062e71-c75d-45a2-bc49-c0da7c3780a7/sampler_weights/spec-9b";
export const WRITERS = { muse: "Muse Spark 1.3 · Vercel AI Gateway", river: "Our trained model · River" } as const;
export type Writer = keyof typeof WRITERS;

// The studio's planner instructions, verbatim apart from its product name.
const PLANNER = readFileSync(`${STUDIO}/agent/instructions.md`, "utf8").replace(/You are Plate, the/g, "You are the");
const SCHEMA = JSON.stringify(z.toJSONSchema(infographicSpecSchema));

function findingsFor(entity: string) {
  return (db
    .query(
      `SELECT p.a_slug, p.b_slug, v.verdict FROM pairs p JOIN verdicts v ON v.pair_id = p.pair_id
       WHERE v.model = ? AND v.prompt_version = '2' AND v.draw = 0 AND v.verdict != 'no_contradiction'
         AND p.a_slug LIKE ? AND p.b_slug LIKE ?`,
    )
    .all(TEACHER, `${entity}/%`, `${entity}/%`) as { a_slug: string; b_slug: string; verdict: string }[])
    .map((f) => `- ${f.verdict}: ${f.a_slug.split("/").pop()} vs ${f.b_slug.split("/").pop()}`);
}

function material(input: { entity?: string; brief?: string }): string {
  if (input.entity) {
    const pages = db.query("SELECT * FROM pages WHERE entity = ? ORDER BY effective_date IS NULL, effective_date, slug").all(input.entity) as Page[];
    if (!pages.length) throw new Error(`no notes for ${input.entity}`);
    const f = findingsFor(input.entity);
    return (
      `[Brief: destination newsletter (format portrait), style preset clean_light]\n` +
      `Make an infographic about ${pages[0]!.title.split(":")[0]} from our company knowledge base (GBrain). Notes, oldest first:\n\n${notesBlock(pages)}` +
      (f.length ? `\n\nThe knowledge base's judge flagged these note pairs (newer claims supersede older ones; print only current values):\n${f.join("\n")}` : "") +
      `\n\nSource line: "Source: Northwind Robotics knowledge base".`
    );
  }
  const brief = (input.brief ?? "").trim();
  if (!brief) throw new Error("empty brief");
  return brief;
}

async function complete(writer: Writer, prompt: string): Promise<string> {
  if (writer === "muse") {
    const r = await chat({ baseUrl: "https://ai-gateway.vercel.sh/v1", apiKey: process.env.AI_GATEWAY_API_KEY!, model: "meta/muse-spark-1.3-contributor" }, prompt, { maxTokens: 8000, temperature: 0.3 });
    return r.text;
  }
  const proc = Bun.spawn([new URL("../.venv/bin/python", import.meta.url).pathname, "river/chat_ckpt.py", SPEC_CKPT, "Qwen/Qwen3.5-9B"], {
    cwd: new URL("..", import.meta.url).pathname, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: process.env,
  });
  proc.stdin.write(JSON.stringify({ prompt }));
  proc.stdin.end();
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  if ((await proc.exited) !== 0) throw new Error(`River: ${err.slice(-300)}`);
  return out;
}

/** Plan a spec with the studio's instructions; validation errors go back to the writer, as the studio's tool does. */
async function planSpec(writer: Writer, input: { entity?: string; brief?: string }) {
  const base =
    `${PLANNER}\n\n# This request\n\nYou cannot call tools here. Reply with ONLY the JSON arguments for generate_infographic, ` +
    `matching this JSON Schema:\n${SCHEMA}\n\n# Material\n\n${material(input)}`;
  let prompt = base;
  let attempts = 0;
  for (; attempts < 3; attempts++) {
    const text = await complete(writer, prompt);
    try {
      const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      delete raw.brandKitId; // no brand kit was chosen in this demo; the instructions only show an example id
      const spec = infographicSpecSchema.parse(raw);
      compileInfographic(spec); // the tool's own checks (text budget and so on)
      return { spec, attempts: attempts + 1 };
    } catch (e) {
      const why = e instanceof z.ZodError ? e.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
      prompt = `${base}\n\nYour previous reply was rejected: ${why.slice(0, 800)}\nFix it and reply with the full JSON again.`;
    }
  }
  throw new Error(`spec rejected ${attempts} times`);
}

function runLoop(spec: unknown, sessionId: string): Promise<any> {
  const proc = Bun.spawn(["bun", "run", new URL("../scripts/studio-loop.ts", import.meta.url).pathname], {
    cwd: STUDIO, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    // Only what the studio's own .env.local lacks; it loads the rest itself.
    env: { PATH: process.env.PATH!, HOME: process.env.HOME!, AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY! },
  });
  proc.stdin.write(JSON.stringify({ spec, sessionId }));
  proc.stdin.end();
  return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(([out, err, code]) => {
    if (code !== 0) throw new Error(`studio loop: ${err.slice(-300)}`);
    return JSON.parse(out);
  });
}

const checks = (r?: { checks?: { passed: number; total: number } }) => r?.checks ?? null;

export async function generate(input: { entity?: string; brief?: string; writer: Writer }) {
  const t0 = performance.now();
  const { spec, attempts } = await planSpec(input.writer, input);
  const tSpec = performance.now();
  const out = await runLoop(spec, `yc-demo-${input.writer}`);
  const first = out.passes?.find((p: any) => p.imageUrl) ?? {};
  return {
    writer: input.writer,
    writerLabel: WRITERS[input.writer],
    spec,
    specAttempts: attempts,
    before: { image: first.imageUrl, verdict: first.verdict, checks: checks(first), defects: first.defects ?? [] },
    after: { image: out.imageUrl, verdict: out.review?.verdict, checks: checks(out.review), defects: (out.review?.defects ?? []).map((d: any) => ({ kind: d.kind, expected: d.expected, found: d.found, message: d.message })) },
    passes: out.passes?.length ?? 0,
    seconds: { spec: (tSpec - t0) / 1000, loop: (performance.now() - tSpec) / 1000 },
  };
}
