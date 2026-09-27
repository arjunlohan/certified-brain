// Precompute the infographic A/B samples shown on the page: each sample through both spec
// writers and the studio's full quality loop. Writes ui/data/samples.json (merged by key).
import { generate, type Writer } from "../src/generate.ts";

export const SAMPLES = [
  {
    key: "ceo",
    title: "Highest-paid CEOs",
    detail: "Article data: America's highest-paid CEOs, 2025 (Equilar and The New York Times)",
    reference: { image: "/data/img/ref-ceo.webp", credit: "Reference: Visual Capitalist (Bruno Venditti, design Clayton Wadsworth)" },
    input: {
      brief:
        "Make an article infographic. America's highest-paid CEOs by total compensation awarded in 2025 (Equilar and The New York Times; grant-date value of salary, bonus, stock and option awards): Elon Musk, Tesla $132.3B; Dylan Field, Figma $864M; Shankh Mitra, Welltower $821M; Kasra Nejatian, Opendoor $741M; RJ Scaringe, Rivian $403M; Niraj Shah, Wayfair $281M; Hock Tan, Broadcom $205M; David Zaslav, Warner Bros. Discovery $165M; David Solomon, Goldman Sachs $119M; Nikesh Arora, Palo Alto Networks $100M; Christopher R. Britt, Chime Financial $99M; Satya Nadella, Microsoft $96M; Jane Fraser, Citigroup $96M; Charles W. Scharf, Wells Fargo $95M; Lip-Bu Tan, Intel $93M. Musk's award is a long-term stock grant that pays out only if Tesla hits market-cap and operational milestones. Median pay of the top 100 CEOs was $39.4M, up 35.8% from 2024.",
    },
  },
  {
    key: "math",
    title: "Best at math",
    detail: "Article data: PISA 2025 average math scores of 15-year-olds (OECD)",
    reference: { image: "/data/img/ref-math.webp", credit: "Reference: Visual Capitalist (Bruno Venditti, design Amy Kuo)" },
    input: {
      brief:
        "Make an article infographic. Average PISA 2025 mathematics scores of 15-year-olds (OECD): China* 612, Singapore 563, Macao 549, Taiwan 546, Japan 525, South Korea 522, Hong Kong 522, Estonia 508, Switzerland 499, UK 488, Canada 485, Poland 484, Netherlands 483, New Zealand 480, Ireland 480, Belgium 480, Australia 478, Austria 477, Germany 464, U.S. 463. OECD average: 463. *China represents Beijing, Shanghai, Jiangsu and Zhejiang.",
    },
  },
  {
    key: "fertilizer",
    title: "Fertilizer exporters",
    detail: "Article data: top fertilizer exporters, 2024 (FAO, nutrient content)",
    reference: { image: "/data/img/ref-fertilizer.webp", credit: "Reference: Visual Capitalist (Gabriel Cohen)" },
    input: {
      brief:
        "Make an article infographic. World's top fertilizer exporters in 2024, million tonnes by nutrient content (FAO; nitrogen, phosphate and potash combined): Russia 23.2, Canada 14.4, Morocco 12.2, China 10.1, U.S. 6.4, Saudi Arabia 5.6, Germany 3.1, Israel 2.8, Qatar 2.5, Belarus 2.4, Netherlands 2.2, Egypt 1.9. Global exports were 113.3 million tonnes; the top four supplied 53%.",
    },
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
          out[s.key] = { ...(out[s.key] ?? {}), title: s.title, detail: s.detail, input: s.input, reference: s.reference, [w]: r };
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
