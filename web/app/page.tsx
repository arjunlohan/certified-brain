import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader, Section, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { type Config, readData } from "@/lib/data";
import { int, pct, usd } from "@/lib/fmt";

export const dynamic = "force-dynamic";

const TOUR = [
  { href: "/reuse", kicker: "Watch", title: "Certified reuse", detail: "Three caches race after the judge changes." },
  { href: "/ask", kicker: "Try it", title: "Ask the brain · A/B", detail: "One question, three answers side by side." },
  { href: "/infographic", kicker: "See it", title: "Infographics · A/B", detail: "Rented model vs our River model, live." },
] as const;

const REPOS = [
  {
    name: "arjunlohan/certified-brain",
    href: "https://github.com/arjunlohan/certified-brain",
    what: "This app, the certifier, River training, all results.",
    status: "built · measured",
  },
  {
    name: "arjunlohan/gbrain · cycle-contradiction-probe",
    href: "https://github.com/arjunlohan/gbrain/tree/cycle-contradiction-probe",
    what: "#5559: contradiction check now runs in the nightly cycle.",
    status: "fork · tested",
  },
  {
    name: "arjunlohan/qm · fix-1452-recall-providers",
    href: "https://github.com/arjunlohan/qm/tree/fix-1452-recall-providers",
    what: "#1452: QM now actually asks external memory like GBrain.",
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
        {node(250, 170, 190, "Write back to brain", "fact-checks saved in GBrain", "built")}
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
        When you change an AI judge, keep only the old answers you can prove are still right. Run it on models you own.
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

        <Section eyebrow="01 · The numbers" title="After one change to GBrain's judge">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={`of ${int(sem.once.cells)} cached verdicts kept`} tone="signal" value={pct(sem.once.reused / sem.once.cells)} />
            <Stat label={`judge calls instead of ${int(sem.once.cells)}`} value={int(certCalls)} />
            <Stat label={`wrong answers served, vs ${int(staleAll)} if you keep everything`} tone="good" value={int(sem.once.presentedError * sem.once.cells)} />
            <Stat label={`budget breaches in ${int(sem.rep.runs)} reruns`} tone="good" value={sem.rep.exceedances} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="of the cache kept when we swap in our own 9B trained on River (untrained: 0%)" tone="signal" value={pct(owned.once.reused / owned.once.cells)} />
            <Stat label="hosts behind one rented model id in a single run" tone="bad" value="3 hosts" />
            <Stat label="valid infographic specs from our River 9B on unseen companies" tone="good" value={`${spec.trained!.validSpecs}/${spec.trained!.prompts}`} />
          </div>
        </Section>

        <Section eyebrow="02 · The loop" title="The flywheel">
          <p className="max-w-3xl text-muted-foreground text-sm">GBrain remembers, QM recalls, River trains the models, and the certificate decides what survives each change.</p>
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
        </Section>

        <Section eyebrow="04 · Limits" title="Limits">
          <ul className="max-w-3xl list-disc space-y-1 pl-5 text-muted-foreground text-sm">
            <li>Synthetic company brain: 60 companies, 353 notes, 4,867 note pairs. GBrain's own judge.</li>
            <li>The race is a replay of recorded runs. Calls and cost are measured, wall-clock time is not.</li>
            <li>QM running live on GBrain is not wired yet; the fork fix unblocks it.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
