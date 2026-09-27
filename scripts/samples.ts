// Precompute the infographic A/B samples shown on the page: each sample through both spec
// writers and the studio's full quality loop. Writes ui/data/samples.json (merged by key).
import { generate, type Writer } from "../src/generate.ts";

export const SAMPLES = [
  { key: "acme", title: "Acme Logistics", detail: "Account health from the brain's notes", input: { entity: "customers/acme-logistics" } },
  { key: "continental", title: "Continental Retail", detail: "Notes that contradict each other", input: { entity: "customers/continental-retail-group" } },
  {
    key: "pisa",
    title: "Best at math",
    detail: "Pasted data: PISA 2025",
    input: { brief: "Make a newsletter infographic. Average PISA 2025 mathematics scores of 15-year-olds (OECD): Singapore 563, Macao 549, Taiwan 546, Japan 525, South Korea 522, Estonia 508, Switzerland 499, UK 488, Canada 485, U.S. 463. OECD average: 463." },
  },
];
const file = new URL("../ui/data/samples.json", import.meta.url).pathname;
const only = process.argv.slice(2);
const out: Record<string, any> = (await Bun.file(file).exists()) ? await Bun.file(file).json() : {};
await Promise.all(
  SAMPLES.filter((s) => !only.length || only.includes(s.key)).flatMap((s) =>
    (["muse", "river"] as Writer[]).map(async (w) => {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await generate({ ...s.input, writer: w });
          out[s.key] = { ...(out[s.key] ?? { title: s.title, detail: s.detail, input: s.input }), [w]: r };
          await Bun.write(file, JSON.stringify(out, null, 1));
          console.log(s.key, w, "before", r.before.checks, "after", r.after.checks, r.after.verdict, "passes", r.passes);
          return;
        } catch (e) {
          console.log(s.key, w, "failed", (e as Error).message.slice(0, 200));
        }
      }
    }),
  ),
);
