import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader, Section, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { type Config, readData } from "@/lib/data";
import { int, pct, usd } from "@/lib/fmt";

export const dynamic = "force-dynamic";

const TOUR = [
  { href: "/reuse", kicker: "Watch", title: "Certified reuse", detail: "Three caches race on one judge change. Guess which edit is safer. Swap in your own judge." },
  { href: "/ask", kicker: "Try it", title: "Ask the brain · A/B", detail: "One question, three cache policies, answers written by DeepSeek on River." },
  { href: "/infographic", kicker: "See it", title: "Infographics · A/B", detail: "Edit the old image vs re-render. Gateway spec writer vs your River 9B." },
] as const;

const REPOS = [
  {
    name: "arjunlohan/certified-brain",
    href: "https://github.com/arjunlohan/certified-brain",
    what: "This app, the certifier (sIVM), the 4,867-pair GBrain verdict cache, River training scripts, every recorded result.",
    status: "built · measured",
  },
  {
    name: "arjunlohan/gbrain · cycle-contradiction-probe",
    href: "https://github.com/arjunlohan/gbrain/tree/cycle-contradiction-probe",
    what: "GBrain #5559: the contradiction probe never ran in the nightly dream cycle. Adds it as a budgeted phase (off by default). 86/86 tests pass.",
    status: "fork · tested",
  },
  {
    name: "arjunlohan/qm · fix-1452-recall-providers",
    href: "https://github.com/arjunlohan/qm/tree/fix-1452-recall-providers",
    what: "QM #1452: turn context called memory.read, so external memory providers like GBrain were never consulted. Now calls recall. New test fails without the fix.",
    status: "fork · tested",
  },
] as const;

function Flywheel() {
  const node = (x: number, y: number, w: number, title: string, sub: string, tone: "built" | "fork" | "designed") => {
    const stroke = tone === "built" ? "var(--signal)" : tone === "fork" ? "var(--foreground)" : "var(--muted-foreground)";
    return (
      <g>
        <rect fill="var(--card)" height="62" rx="10" stroke={stroke} strokeDasharray={tone === "designed" ? "5 4" : undefined} strokeWidth="1.5" width={w} x={x} y={y} />
        <text fill="var(--foreground)" fontFamily="var(--font-display)" fontSize="15" letterSpacing="0.5" textAnchor="middle" x={x + w / 2} y={y + 26}>
          {title.toUpperCase()}
        </text>
        <text fill="var(--muted-foreground)" fontSize="11" textAnchor="middle" x={x + w / 2} y={y + 45}>
          {sub}
        </text>
      </g>
    );
  };
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card p-4 shadow-[var(--card-shadow)]">
      <svg aria-labelledby="fw" className="min-w-[760px]" role="img" viewBox="0 0 900 400" width="100%">
        <title id="fw">
          The loop: notes land in GBrain; a judge on River scores note pairs into a verdict cache; a QM agent recalls the brain; a spec writer on River plans an
          infographic that Hy Image renders; a vision fact-check writes results back into the brain. When the judge or prompt changes, the certificate decides which
          cached verdicts survive, and the surviving labels train the next owned model on River.
        </title>
        <defs>
          <marker id="a" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" />
          </marker>
          <marker id="s" markerHeight="7" markerWidth="7" orient="auto-start-reverse" refX="9" refY="5" viewBox="0 0 10 10">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--signal)" />
          </marker>
        </defs>
        {node(20, 30, 190, "GBrain memory", "notes + verdict cache · Neon", "built")}
        {node(250, 30, 190, "Judge on River", "owned 9B or DeepSeek weights", "built")}
        {node(480, 30, 190, "QM agent", "recalls GBrain (fork fix)", "fork")}
        {node(690, 30, 190, "Spec writer on River", "owned 9B, replaces gateway", "built")}
        {node(690, 170, 190, "Hy Image 3.5", "text-to-image · image-to-image", "built")}
        {node(480, 170, 190, "Vision fact-check", "text contract vs pixels", "built")}
        {node(250, 170, 190, "Write back to brain", "QA outcomes as memory", "designed")}
        {node(20, 170, 190, "Nightly dream cycle", "contradiction probe (fork)", "fork")}
        <g fill="none" markerEnd="url(#a)" stroke="var(--muted-foreground)" strokeWidth="1.4">
          <line x1="210" x2="248" y1="61" y2="61" />
          <line x1="440" x2="478" y1="61" y2="61" />
          <line x1="670" x2="688" y1="61" y2="61" />
          <line x1="785" x2="785" y1="92" y2="168" />
          <line x1="690" x2="672" y1="201" y2="201" />
          <line x1="480" x2="442" y1="201" y2="201" />
          <line x1="250" x2="212" y1="201" y2="201" />
          <line x1="115" x2="115" y1="170" y2="94" />
        </g>
        <rect fill="color-mix(in oklch, var(--signal) 14%, transparent)" height="92" rx="12" stroke="var(--signal)" strokeWidth="1.5" width="860" x="20" y="280" />
        <text fill="var(--foreground)" fontFamily="var(--font-display)" fontSize="17" letterSpacing="0.5" x="40" y="310">
          THE CERTIFICATE · WHEN A PROMPT OR MODEL CHANGES
        </text>
        <text fill="var(--muted-foreground)" fontSize="12.5" x="40" y="334">
          Stock: throw every cached verdict and lesson away and pay to rebuild. Reuse-all: keep them and serve stale ones.
        </text>
        <text fill="var(--muted-foreground)" fontSize="12.5" x="40" y="354">
          Certified: sample, bound the flip rate per group, keep only what clears α. The kept labels train the next owned model on River.
        </text>
        <g fill="none" markerEnd="url(#s)" stroke="var(--signal)" strokeDasharray="4 3" strokeWidth="1.5">
          <line x1="115" x2="115" y1="278" y2="236" />
          <line x1="345" x2="345" y1="278" y2="236" />
          <line x1="575" x2="575" y1="278" y2="236" />
        </g>
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 px-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-signal" /> built and measured here</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-foreground" /> fix on our fork, tested</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-sm border-2 border-dashed border-muted-foreground" /> designed, not wired live yet</span>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const results = readData<{ results: Config[] }>("report.json").results;
  const get = (edit: string) => results.find((c) => c.edit === edit && c.alpha === 0.1 && c.stratifier === "value")!;
  const sem = get("Semantic prompt edit");
  const owned = get("Swap to owned 9B (trained)");
  const spec = readData<Record<string, { validSpecs: number; prompts: number; groundedValuesPct: number }>>("spec-eval.json");
  const staleAll = sem.once.strata.reduce((a, s) => a + Math.round(s.trueFlipRate * s.size), 0);
  const certCalls = sem.once.cells - sem.once.reused;

  return (
    <>
      <PageHeader crumb="How it works" kicker="YC · Own Your Intelligence hackathon · 27 Sep 2026" title={<>A memory that survives <span className="text-signal">changing its mind</span></>}>
        Every agent memory caches LLM judgments: which notes contradict, which facts are current, what a chart should say. Change the prompt or swap the model
        and those judgments are either thrown away (expensive) or kept blindly (wrong). We attach a statistical certificate to GBrain's verdict cache so it keeps
        exactly what it can prove, and we move the judge and the infographic writer onto models we own and trained on River.
      </PageHeader>
      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-8 sm:px-6">
        <section aria-label="Tour" className="grid gap-2 sm:grid-cols-3">
          {TOUR.map((t) => (
            <Link
              className="group flex flex-col items-start gap-1 rounded-xl border bg-card/60 p-4 text-left transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:shadow-[0_0_0_2px_var(--ring)] focus-visible:outline-none active:scale-[0.98] [@media(hover:hover)]:hover:bg-card"
              href={t.href}
              key={t.href}
            >
              <span className="flex w-full items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
                {t.kicker}
                <ArrowUpRightIcon className="size-3.5 transition-transform duration-[var(--duration-fast)] [@media(hover:hover)]:group-hover:-translate-y-0.5 [@media(hover:hover)]:group-hover:translate-x-0.5" />
              </span>
              <span className="font-display text-lg uppercase leading-tight">{t.title}</span>
              <span className="text-muted-foreground text-xs">{t.detail}</span>
            </Link>
          ))}
        </section>

        <Section eyebrow="01 · The numbers" title="One semantic prompt change to GBrain's contradiction judge">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={`of ${int(sem.once.cells)} cached verdicts reused, with a certificate (α = 0.1)`} tone="signal" value={pct(sem.once.reused / sem.once.cells)} />
            <Stat label={`judge calls, vs ${int(sem.once.cells)} for stock GBrain (${usd(certCalls * sem.costPerCall)} vs ${usd(sem.once.cells * sem.costPerCall)})`} value={int(certCalls)} />
            <Stat label={`stale verdicts served, vs ${int(staleAll)} if you reuse everything`} tone="good" value={int(sem.once.presentedError * sem.once.cells)} />
            <Stat label={`of ${int(sem.rep.runs)} replications exceeded the error budget`} tone="good" value={sem.rep.exceedances} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`of the cache inherited by a Qwen 9B we trained on River, at ${pct(owned.once.presentedError, 2)} realized error. Untrained: 0%.`} tone="signal" value={pct(owned.once.reused / owned.once.cells)} />
            <Stat label="self-flip floor when one gateway model id was served by three hosts; owned weights keep the floor fixed" tone="bad" value="3 hosts" />
            <Stat label={`valid, fully grounded infographic specs from our River 9B on held-out companies (gateway model: ${spec.teacher!.validSpecs}/${spec.teacher!.prompts})`} tone="good" value={`${spec.trained!.validSpecs}/${spec.trained!.prompts}`} />
          </div>
        </Section>

        <Section eyebrow="02 · The loop" title="The flywheel, on top of the infographic studio's">
          <p className="max-w-3xl text-muted-foreground text-sm">
            The infographic studio already fact-checks every render, then throws the review away when the session ends. The flywheel it needs has three missing
            parts: a durable memory for outcomes, a model you can retrain on them, and a gate that stops stale lessons from shipping. GBrain is the memory, QM is the
            agent that recalls it, River trains the owned judge and spec writer, and the certificate is the gate: when the prompt or the model changes, it keeps the
            lessons it can prove and re-checks the rest, instead of discarding them all or trusting them all.
          </p>
          <Flywheel />
        </Section>

        <Section eyebrow="03 · Verify it" title="Where the code lives">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-[var(--card-shadow)]">
            {REPOS.map((r) => (
              <a className="flex flex-col gap-1 border-b px-4 py-3 last:border-0 hover:bg-muted/50 lg:flex-row lg:items-center lg:gap-4" href={r.href} key={r.href} rel="noreferrer" target="_blank">
                <span className="shrink-0 font-mono text-xs lg:w-80">{r.name}</span>
                <span className="flex-1 text-muted-foreground text-sm">{r.what}</span>
                <Badge className="shrink-0" variant="outline">{r.status}</Badge>
              </a>
            ))}
          </div>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Stack: GBrain (hosted at gbrain.io over MCP, with the demo company's 72 notes under northwind/), GBrain's own judge prompt and parser, River (LoRA SFT
            of Qwen3.5-9B and DeepSeek-V4-Flash, served from checkpoints), Hy Image 3.5 preview on GMI Cloud, Neon Postgres as the mirror of every verdict,
            certificate and render, DeepSeek V4 Flash via the Vercel AI Gateway as the teacher judge.
          </p>
        </Section>

        <Section eyebrow="04 · Limits" title="What this does not show">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-muted-foreground text-sm">
            <li>The corpus is synthetic: 60 companies, 353 notes, 4,867 note pairs, generated for the demo. The judge and parser are GBrain's own.</li>
            <li>The replay is recorded runs, not a live re-certification on stage. Speed is not measured head to head; judge calls and cost are.</li>
            <li>QM with GBrain as its memory provider, and writing QA outcomes back into the brain, are designed and unblocked by the fork fix but not running live.</li>
            <li>The infographic render comparisons are single images (n = 1 each). The spec-writer numbers are over 19 held-out prompts.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
