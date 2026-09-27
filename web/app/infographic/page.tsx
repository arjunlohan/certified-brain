import { existsSync } from "node:fs";
import path from "node:path";
import { PageHeader } from "@/components/page-header";
import { readData } from "@/lib/data";
import { Generator, type Sample } from "./generator";

export const dynamic = "force-dynamic";

const STEPS = ["Brain notes (GBrain)", "Spec", "Hy Image 3.5", "Fact-check", "Fix pass", "QA saved, next render learns"];

export default function InfographicPage() {
  const samples = existsSync(path.join(process.cwd(), "../ui/data/samples.json")) ? readData<Record<string, Sample>>("samples.json") : {};
  return (
    <>
      <PageHeader crumb="Infographics · A/B" kicker="Rented model vs our model" title={<>Infographics · <span className="text-signal">A/B</span></>}>
        Same material, two spec writers, the same render and fix loop. Before is the first render, after is what the loop ships.
      </PageHeader>
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-xs">
          {STEPS.map((s, i) => (
            <li className="flex items-center gap-1.5" key={s}>
              <span className="rounded-full border bg-card px-2.5 py-1">{s}</span>
              {i < STEPS.length - 1 ? <span className="text-muted-foreground">→</span> : null}
            </li>
          ))}
        </ol>
        <Generator samples={samples} />
      </div>
    </>
  );
}
