// Fact-check each rendered infographic against its spec's text contract with
// the studio's vision reviewer, and store the verdicts in ui/data/infographic.json.
// Usage: bun run scripts/review-infographic.ts
import { compileInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/infographic.ts";
import { reviewInfographic } from "../../gmi-hackathon-infographic-agent/agent/lib/review.ts";

const file = new URL("../ui/data/infographic.json", import.meta.url).pathname;
const rec = await Bun.file(file).json();
const cBefore = compileInfographic(rec.before.spec);
const cAfter = compileInfographic(rec.afterFull.spec);

const jobs = [
  ["before", rec.before.url, cBefore],
  ["afterEdit", rec.afterEdit.url, cAfter],
  ["afterFull", rec.afterFull.url, cAfter],
] as const;

await Promise.all(
  jobs.map(async ([key, url, c]) => {
    if (!url) return;
    const review = await reviewInfographic({ imageUrl: url, textContract: c.textContract, dataSummary: c.dataSummary, callouts: c.callouts });
    rec[key].review = {
      verdict: review.verdict, score: review.score, contract: c.textContract.length,
      wrongOrMissing: review.wrongOrMissing, invented: review.invented,
    };
    console.log(`${key}: ${review.verdict} ${review.score}/10, ${review.wrongOrMissing.length} wrong or missing of ${c.textContract.length}, invented: ${review.invented.join(" | ")}`);
    for (const w of review.wrongOrMissing) console.log(`   expected "${w.expected}" found "${w.found}"`);
  }),
);
await Bun.write(file, JSON.stringify(rec, null, 1));
