// Render one held-out entity from the teacher's spec (Muse Spark) and from the
// River-trained 9B's spec with Hy Image 3.5, then fact-check both with the studio's
// reviewer. Writes ui/data/spec-render.json and images.
// Usage: bun run scripts/spec-render.ts [entity|variant=customers/acme-logistics|current]
import { readFileSync } from "node:fs";
import { compileInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";
import { generateHyImage } from "../../gmi-hackathon-infographic-agent/agent/lib/gmi.ts";
import { reviewInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/review.ts";
import { parseSpec } from "../src/spec.ts";

const key = process.argv[2] ?? "customers/acme-logistics|current";
const dir = new URL("../river/data/", import.meta.url).pathname;
const read = (f: string) => readFileSync(dir + f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const teacherRow = read("spec-eval.jsonl").find((r: any) => `${r.entity}|${r.variant}` === key);
const trainedRow = read("spec-9b-labels.jsonl").find((r: any) => r.pair_id === key);
const specs = { teacher: parseSpec(teacherRow.completion), trained: parseSpec(trainedRow.text) };

const out: Record<string, any> = { key, writers: { teacher: "meta/muse-spark-1.3-contributor (gateway)", trained: "Qwen3.5-9B LoRA on River" } };
const img = new URL("../ui/data/img/", import.meta.url).pathname;
await Promise.all(
  (Object.keys(specs) as (keyof typeof specs)[]).map(async (w) => {
    const c = compileInfographic(specs[w]);
    let image;
    for (let i = 0; i < 3 && !image; i++) {
      try { image = await generateHyImage({ prompt: c.prompt, size: c.size as any, seed: 11 }); } catch (e) { console.log(w, "render retry", (e as Error).message.slice(0, 80)); }
    }
    if (!image) throw new Error(`${w} render failed`);
    const file = `${key.replace(/[/|]/g, "_")}-${w}.png`;
    await Bun.write(img + file, await (await fetch(image.url)).arrayBuffer());
    const review = await reviewInfographic({ imageUrl: image.url, textContract: c.textContract, dataSummary: c.dataSummary, callouts: c.callouts });
    out[w] = {
      spec: specs[w], image: `data/img/${file}`, url: image.url,
      review: { verdict: review.verdict, score: review.score, contract: c.textContract.length, wrongOrMissing: review.wrongOrMissing, invented: review.invented },
    };
    console.log(`${w}: ${review.score}/10, ${review.wrongOrMissing.length} wrong or missing of ${c.textContract.length}, invented: ${review.invented.join(" | ")}`);
  }),
);
out.eval = await Bun.file(new URL("../ui/data/spec-eval.json", import.meta.url).pathname).json();
await Bun.write(new URL("../ui/data/spec-render.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
