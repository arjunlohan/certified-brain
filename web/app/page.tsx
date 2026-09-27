import { ArrowUpRightIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { type Config, type Floor, readData } from "@/lib/data";
import { ReuseReplay } from "./reuse/replay";

export const dynamic = "force-dynamic";

const PDF = "/data/paper/reuse-but-verify.pdf";
const DOI = "https://doi.org/10.5281/zenodo.21833641";
const LINES = [
  ["Why", "Every prompt or model change forces an AI memory to re-run every saved judgment, or trust stale ones."],
  ["What", "Sample each group of saved answers. Keep a group only when a statistical bound proves few changed."],
  ["Where", "Agent memories like GBrain, AI-filled spreadsheet cells, eval caches, any cache of AI judgments."],
] as const;

export default function Home() {
  const configs = readData<{ results: Config[] }>("report.json").results.filter((c) => c.stratifier === "value");
  const floors = ["floor-pinned.json", "floor-unpinned.json", "floor-owned-dsv4.json", "floor-owned.json"].map((f) => readData<Floor>(f));
  return (
    <>
      <PageHeader crumb="Certified reuse" kicker="Reuse, but verify" title={<>Change the AI judge. <span className="text-signal">Keep what you can prove.</span></>}>
        Check a sample of the old answers, keep only what still holds.
      </PageHeader>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6">
        <section aria-label="The paper" className="flex flex-col gap-5 rounded-2xl border bg-card p-4 shadow-[var(--card-shadow)] sm:flex-row">
          <a className="block w-full shrink-0 overflow-hidden rounded-lg border bg-white transition-transform duration-[var(--duration-fast)] active:scale-[0.98] sm:w-40" href={PDF} rel="noreferrer" target="_blank">
            {/* biome-ignore lint/performance/noImgElement: proxied static preview */}
            <img alt="First page of the paper" className="block w-full" src={`${PDF}.png`} />
          </a>
          <div className="min-w-0 space-y-3">
            <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.08em]">The paper</p>
            <a className="block font-display text-xl uppercase leading-tight tracking-wide hover:underline" href={PDF} rel="noreferrer" target="_blank">
              Reuse, but Verify: Certified Maintenance of LLM-Computed Table Cells under Prompt Edits
            </a>
            <p className="flex flex-wrap items-center gap-x-3 text-muted-foreground text-sm">
              <span>Lohan, 2026</span>
              <a className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground" href={DOI} rel="noreferrer" target="_blank">
                doi.org/10.5281/zenodo.21833641 <ArrowUpRightIcon className="size-3" />
              </a>
            </p>
            <dl className="space-y-1 text-sm">
              {LINES.map(([k, v]) => (
                <div className="flex gap-3" key={k}>
                  <dt className="w-12 shrink-0 font-medium text-signal">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>
      <ReuseReplay configs={configs} floors={floors} />
    </>
  );
}
