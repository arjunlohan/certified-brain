import { readFileSync } from "node:fs";
import path from "node:path";
import { ArrowRightIcon } from "lucide-react";
import { PageHeader, Section, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { int, pct } from "@/lib/fmt";
import { type Render, RenderCard, Reveal } from "./render-card";

export const dynamic = "force-dynamic";

type Spec = { title: string; subtitle: string; chart: { data: { label: string; value: string }[] }; footnote?: string };
type Infographic = {
  entity: string;
  cutoff: string;
  specModel: string;
  imageModel: string;
  findings: string[];
  changes: string[];
  before: Render & { spec: Spec };
  afterEdit: Render & { prompt: string };
  afterFull: Render & { spec: Spec };
};
type EvalRow = {
  prompts: number;
  validSpecs: number;
  validPct: number;
  groundedValuesPct: number;
  printedValues: number;
  labelOverlapWithTeacher: number;
};
type SpecEval = Record<"teacher" | "trained" | "base", EvalRow>;
type SpecRender = {
  key: string;
  writers: { teacher: string; trained: string };
  teacher: Render & { spec: Spec };
  trained: Render & { spec: Spec };
};

const DATA = path.join(process.cwd(), "../ui/data");
const load = <T,>(name: string): T => JSON.parse(readFileSync(path.join(DATA, name), "utf8")) as T;

const WRITERS: { key: keyof SpecEval; name: string; note: string }[] = [
  { key: "teacher", name: "Muse Spark (gateway, not owned)", note: "Muse Spark 1.3 via the Vercel AI Gateway, the infographic studio's writer today" },
  { key: "trained", name: "Owned 9B on River", note: "Qwen3.5-9B LoRA, trained on 89 of Muse Spark's specs" },
  { key: "base", name: "Untrained 9B", note: "Qwen3.5-9B, same prompts, no training" },
];

const fleet = (s: Spec) => s.chart.data.find((d) => /pallet movers/i.test(d.label))?.value;

export default function InfographicPage() {
  const ig = load<Infographic>("infographic.json");
  const ev = load<SpecEval>("spec-eval.json");
  const sr = load<SpecRender>("spec-render.json");

  const entityName = ig.before.spec.title;
  const edit = ig.afterEdit.review;
  const full = ig.afterFull.review;
  const leaked = edit.invented;

  return (
    <>
      <PageHeader crumb="Infographics · A/B" kicker="Brain to picture · Hy Image 3.5 on GMI Cloud" title={<>Infographics · <span className="text-signal">A/B</span></>}>
        Two experiments that turn the brain's knowledge into infographics. A model writes a spec from the notes, Hy Image 3.5
        preview renders it on GMI Cloud, and a vision reviewer fact-checks every render against the spec's text contract: each
        required string must appear, spelled right, and nothing else may be printed.
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-8 sm:px-6">
        <Section eyebrow={`A/B 1 · ${ig.entity}`} title="When the memory changes">
          <p className="max-w-3xl text-muted-foreground text-sm text-pretty">
            The spec for <span className="text-foreground">{entityName}</span> was first written from the notes the brain held
            before {ig.cutoff}. Later notes corrected it, and {ig.findings.length} cached judge verdicts for this entity
            (supersessions and contradictions) turned into {ig.changes.length} changes. There are two ways to update the picture:{" "}
            <b className="text-foreground">A</b>, edit the old image in place (cheap reuse, nothing re-checked), or{" "}
            <b className="text-foreground">B</b>, write a fresh spec and re-render from scratch (recompute).
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="changes to the facts" tone="signal" value={int(ig.changes.length)} />
            <Stat label={`A · edit: wrong or missing of ${edit.contract}`} tone="bad" value={int(edit.wrongOrMissing.length)} />
            <Stat label={`B · re-render: wrong or missing of ${full.contract}`} tone="good" value={int(full.wrongOrMissing.length)} />
            <Stat label="stale facts leaked by the edit" tone="bad" value={int(leaked.length)} />
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-[var(--card-shadow)]">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">What changed in the brain</p>
            <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {ig.changes.map((c, i) => (
                <li className="flex gap-2" key={c}>
                  <span className="font-mono text-muted-foreground text-xs tabular-nums leading-5">{i + 1}.</span>
                  <span className="min-w-0 break-words">{c}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <RenderCard label="Before" meta="Original spec · text-to-image" render={ig.before} title={ig.before.spec.title} />
            <RenderCard label="A · edit the old image" meta="Image-to-image edit · cheap reuse" render={ig.afterEdit} title="Edited in place" tone="bad">
              <Reveal label="Show the edit prompt" text={ig.afterEdit.prompt} />
            </RenderCard>
            <RenderCard label="B · full re-render" meta="Fresh spec · text-to-image" render={ig.afterFull} title={ig.afterFull.spec.title} tone="good" />
          </div>

          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm sm:p-5">
            <p className="font-display text-lg uppercase tracking-wide">
              The edit leaked <span className="text-destructive">{leaked.length} stale facts</span>. The re-render leaked none.
            </p>
            <p className="mt-2 flex flex-wrap gap-2">
              {leaked.map((s) => (
                <Badge className="border-destructive/40 text-destructive" key={s} variant="outline">
                  "{s}"
                </Badge>
              ))}
            </p>
            <p className="mt-3 max-w-3xl text-muted-foreground text-pretty">
              The edit prompt asked for every change and said to keep everything else identical. The model applied some changes
              and left others untouched, so the picture now mixes {ig.cutoff} facts with current ones. It is the same
              lesson as the certified cache: reuse without checking leaks stale facts, whether the thing reused is a verdict or
              a picture. The full re-render's one miss is a garbled headline ("{full.wrongOrMissing[0]?.found}"), a typesetting
              error, not a stale fact.
            </p>
          </div>

          <p className="text-muted-foreground text-xs">
            Spec writer <span className="font-mono">{ig.specModel}</span> · renderer <span className="font-mono">{ig.imageModel}</span>{" "}
            · reviewer: the infographic studio's vision fact-checker
          </p>
        </Section>

        <Section eyebrow="A/B 2 · who writes the spec" title="Who writes the spec">
          <p className="max-w-3xl text-muted-foreground text-sm text-pretty">
            The infographic studio's spec writer is Muse Spark 1.3 through the Vercel AI Gateway: a model we rent, not one we
            own. We LoRA-trained Qwen3.5-9B on River (40 steps, batch 8) on 89 of Muse Spark's own specs and scored both on{" "}
            {ev.teacher.prompts} held-out prompts from 10 entities never seen in training.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="valid specs · owned 9B" tone="good" value={`${ev.trained.validSpecs}/${ev.trained.prompts}`} />
            <Stat label="valid specs · untrained 9B" tone="bad" value={`${ev.base.validSpecs}/${ev.base.prompts}`} />
            <Stat label="printed numbers found in the notes · owned 9B" tone="good" value={pct(ev.trained.groundedValuesPct, 0)} />
            <Stat label="same data labels as Muse Spark · owned 9B" tone="signal" value={pct(ev.trained.labelOverlapWithTeacher, 0)} />
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <p className="font-display text-base uppercase tracking-wide">Held-out eval</p>
              <span className="text-muted-foreground text-xs tabular-nums">{ev.teacher.prompts} prompts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs">
                    <th className="px-4 py-2 font-medium">Spec writer</th>
                    <th className="px-4 py-2 text-right font-medium">Valid specs</th>
                    <th className="px-4 py-2 text-right font-medium">Printed numbers grounded</th>
                    <th className="px-4 py-2 text-right font-medium">Printed values</th>
                    <th className="px-4 py-2 text-right font-medium">Label overlap with Muse Spark</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {WRITERS.map(({ key, name, note }) => {
                    const r = ev[key];
                    return (
                      <tr className="border-b last:border-0" key={key}>
                        <td className="px-4 py-3">
                          <div className={key === "trained" ? "font-medium text-signal" : "font-medium"}>{name}</div>
                          <div className="text-muted-foreground text-xs">{note}</div>
                        </td>
                        <td className={`px-4 py-3 text-right ${r.validSpecs < r.prompts ? "text-destructive" : ""}`}>
                          {r.validSpecs} / {r.prompts}
                        </td>
                        <td className="px-4 py-3 text-right">{pct(r.groundedValuesPct, 0)}</td>
                        <td className="px-4 py-3 text-right">{int(r.printedValues)}</td>
                        <td className="px-4 py-3 text-right">{key === "teacher" ? "reference" : pct(r.labelOverlapWithTeacher, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <RenderCard
              label="Muse Spark (gateway, not owned)"
              meta={`${sr.teacher.spec.title} · spec by ${sr.writers.teacher}`}
              render={sr.teacher}
              title="Muse Spark spec"
            />
            <RenderCard
              label="Owned 9B on River"
              meta={`${sr.trained.spec.title} · spec by ${sr.writers.trained}`}
              render={sr.trained}
              title="Owned 9B spec"
              tone="good"
            />
          </div>

          <div className="rounded-2xl border bg-card p-4 text-sm shadow-[var(--card-shadow)] sm:p-5">
            <p className="font-display text-lg uppercase tracking-wide">Read this honestly</p>
            <ul className="mt-2 max-w-3xl space-y-2 text-muted-foreground text-pretty">
              <li className="flex gap-2">
                <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-signal" />
                <span>
                  The render comparison is <b className="text-foreground">n = 1</b> (Acme Logistics): a single render per writer,
                  not a benchmark.
                </span>
              </li>
              <li className="flex gap-2">
                <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-signal" />
                <span>
                  The two specs disagree on the fleet: the owned 9B charted{" "}
                  <b className="text-foreground">{fleet(sr.trained.spec)} pallet movers</b>, Muse Spark charted{" "}
                  <b className="text-foreground">{fleet(sr.teacher.spec)}</b>. The reviewer checks the picture against its own
                  spec, not the spec against the notes, so a clean fact-check says the image matches the spec, not that the spec
                  picked the latest fact.
                </span>
              </li>
              <li className="flex gap-2">
                <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-signal" />
                <span>
                  The eval table is the stronger evidence: on {ev.trained.prompts} held-out prompts the owned 9B wrote a valid spec
                  every time with every printed number grounded in the notes, and reused Muse Spark's data labels{" "}
                  {pct(ev.trained.labelOverlapWithTeacher, 0)} of the time (untrained: {pct(ev.base.labelOverlapWithTeacher, 0)}).
                </span>
              </li>
            </ul>
          </div>
        </Section>
      </div>
    </>
  );
}
