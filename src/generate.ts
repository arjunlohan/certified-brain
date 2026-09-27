// Live A/B infographic: the same brief goes to two spec writers (Muse Spark on
// the gateway vs our Qwen3.5-9B trained on River). Each spec is compiled into an
// image prompt by the infographic studio's own compiler, rendered by Hy Image 3.5
// and fact-checked by the studio's vision reviewer.
import { compileInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";
import { generateHyImage } from "../../gmi-hackathon-infographic-agent/agent/lib/gmi.ts";
import { reviewInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/review.ts";
import { chat } from "./llm.ts";
import { parseSpec, specPrompt } from "./spec.ts";
import { db, type Page } from "./store.ts";

const TEACHER = "deepseek/deepseek-v4-flash-0731";
const SPEC_CKPT = "river://52062e71-c75d-45a2-bc49-c0da7c3780a7/sampler_weights/spec-9b";
export const WRITERS = {
  muse: "Muse Spark 1.3 · Vercel AI Gateway",
  river: "Qwen3.5-9B trained on River · owned",
} as const;
export type Writer = keyof typeof WRITERS;

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

/** Brain entity: its notes plus the judge's findings. Free text: the brief is the only note. */
export function promptFor(input: { entity?: string; brief?: string }): string {
  if (input.entity) {
    const pages = db.query("SELECT * FROM pages WHERE entity = ? ORDER BY effective_date IS NULL, effective_date, slug").all(input.entity) as Page[];
    if (!pages.length) throw new Error(`no notes for ${input.entity}`);
    return specPrompt(pages, findingsFor(input.entity));
  }
  const brief = (input.brief ?? "").trim();
  if (!brief) throw new Error("empty brief");
  return specPrompt([{ slug: "brief", entity: "brief", title: "Brief", effective_date: null, text: brief }]);
}

async function writeSpec(writer: Writer, prompt: string): Promise<string> {
  if (writer === "muse") {
    const r = await chat(
      { baseUrl: "https://ai-gateway.vercel.sh/v1", apiKey: process.env.AI_GATEWAY_API_KEY!, model: "meta/muse-spark-1.3-contributor" },
      prompt,
      { maxTokens: 6000, temperature: 0.3 },
    );
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

export async function generate(input: { entity?: string; brief?: string; writer: Writer }) {
  const t0 = performance.now();
  const prompt = promptFor(input);
  let spec;
  for (let i = 0; i < 2 && !spec; i++) {
    try { spec = parseSpec(await writeSpec(input.writer, prompt)); } catch (e) { if (i === 1) throw new Error(`spec: ${(e as Error).message.slice(0, 200)}`); }
  }
  const tSpec = performance.now();
  const c = compileInfographic(spec!);
  let image;
  for (let i = 0; i < 3 && !image; i++) {
    try { image = await generateHyImage({ prompt: c.prompt, size: c.size as any, seed: 11 }); } catch (e) { if (i === 2) throw e; }
  }
  const tImg = performance.now();
  const file = `gen-${Date.now()}-${input.writer}.png`;
  await Bun.write(new URL(`../ui/data/img/${file}`, import.meta.url).pathname, await (await fetch(image!.url)).arrayBuffer());
  const review = await reviewInfographic({ imageUrl: image!.url, textContract: c.textContract, dataSummary: c.dataSummary, callouts: c.callouts });
  return {
    writer: input.writer, writerLabel: WRITERS[input.writer], spec, imagePrompt: c.prompt, image: `/data/img/${file}`,
    review: { verdict: review.verdict, score: review.score, contract: c.textContract.length, wrongOrMissing: review.wrongOrMissing, invented: review.invented },
    seconds: { spec: (tSpec - t0) / 1000, render: (tImg - tSpec) / 1000, review: (performance.now() - tImg) / 1000 },
  };
}
