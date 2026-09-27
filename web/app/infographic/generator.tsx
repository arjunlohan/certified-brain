"use client";

import { ArrowUpIcon, ArrowUpRightIcon, CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Review = { verdict: string; score: number; contract: number; wrongOrMissing: { expected: string; found: string }[]; invented: string[] };
type Result = { writer: string; writerLabel: string; image: string; review: Review; seconds: { spec: number; render: number; review: number }; spec: { title: string } };
type Lane = { status: "idle" | "running" | "done" | "error"; started?: number; result?: Result; error?: string };
type Input = { entity?: string; brief?: string };

const WRITERS = [
  { key: "muse", name: "Muse Spark 1.3", sub: "Vercel AI Gateway · rented", dot: "bg-muted-foreground" },
  { key: "river", name: "Our 9B on River", sub: "Qwen3.5-9B, trained · owned", dot: "bg-signal" },
] as const;

// Facts only, so the starters work without reproducing anyone's writing.
const STARTERS: { kicker: string; title: string; detail: string; input: Input }[] = [
  { kicker: "From the brain", title: "Acme Logistics", detail: "Account health from 6 notes", input: { entity: "customers/acme-logistics" } },
  { kicker: "From the brain", title: "Continental Retail", detail: "Notes that contradict each other", input: { entity: "customers/continental-retail-group" } },
  {
    kicker: "Paste data",
    title: "Countries best at math",
    detail: "PISA 2025 scores",
    input: {
      brief:
        "Average PISA 2025 mathematics scores of 15-year-olds (OECD): Singapore 563, Macao 549, Taiwan 546, Japan 525, South Korea 522, Estonia 508, Switzerland 499, UK 488, Canada 485, U.S. 463. OECD average: 463.",
    },
  },
];

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const s = (now - since) / 1000;
  const stage = s < 6 ? "Writing the spec" : s < 40 ? "Rendering with Hy Image 3.5" : "Fact-checking every label";
  return (
    <p className="shimmer relative max-w-xs text-balance text-center text-muted-foreground text-sm">
      {stage}… {s.toFixed(0)}s
    </p>
  );
}

function LaneCard({ w, lane }: { w: (typeof WRITERS)[number]; lane: Lane }) {
  const r = lane.result;
  const wrong = (r?.review.wrongOrMissing.length ?? 0) + (r?.review.invented.length ?? 0);
  return (
    <figure className="m-0 w-full overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]">
      <figcaption className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-display text-base uppercase tracking-wide">
            <span className={`inline-block size-2 rounded-full ${w.dot}`} /> {w.name}
          </p>
          <p className="text-muted-foreground text-xs">{w.sub}</p>
        </div>
        {r ? (
          <Badge className={wrong ? "border-destructive text-destructive" : "border-emerald-600 text-emerald-700 dark:text-emerald-400"} variant="outline">
            {wrong ? <TriangleAlertIcon /> : <CheckCircle2Icon />} {wrong ? `${wrong} issue${wrong > 1 ? "s" : ""}` : "all labels right"} · {r.review.score}/10
          </Badge>
        ) : null}
      </figcaption>
      <div className="relative flex aspect-[3/4] items-center justify-center bg-muted dark:bg-black/40">
        {lane.status === "running" ? (
          <>
            <div aria-hidden className="studio-scan absolute inset-0" />
            <Elapsed since={lane.started!} />
          </>
        ) : lane.status === "error" ? (
          <p className="px-6 text-center text-destructive text-sm">{lane.error}</p>
        ) : r ? (
          <Dialog>
            <DialogTrigger asChild>
              <button className="size-full cursor-zoom-in" type="button">
                <img alt={r.spec.title} className="size-full object-contain" src={r.image} />
              </button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] flex-col items-center border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]">
              <DialogTitle className="sr-only">{r.spec.title}</DialogTitle>
              <img alt={r.spec.title} className="max-h-[calc(100dvh-4rem)] w-auto rounded-lg object-contain" src={r.image} />
            </DialogContent>
          </Dialog>
        ) : (
          <p className="text-muted-foreground text-sm">Pick a prompt below</p>
        )}
      </div>
      {r ? (
        <div className="space-y-2 px-4 py-3 text-xs">
          <p className="text-muted-foreground tabular-nums">
            spec {r.seconds.spec.toFixed(1)}s · render {r.seconds.render.toFixed(0)}s · check {r.seconds.review.toFixed(0)}s
          </p>
          {r.review.wrongOrMissing.map((x, i) => (
            <p className="rounded-md bg-destructive/5 px-2 py-1" key={i}>
              expected <b>{x.expected}</b> · found <span className="text-destructive">{x.found}</span>
            </p>
          ))}
          {r.review.invented.length ? <p className="text-destructive">invented: {r.review.invented.join(" · ")}</p> : null}
        </div>
      ) : null}
    </figure>
  );
}

export function Generator() {
  const [entities, setEntities] = useState<string[]>([]);
  const [entity, setEntity] = useState("customers/acme-logistics");
  const [brief, setBrief] = useState("");
  const [lanes, setLanes] = useState<Record<string, Lane>>({ muse: { status: "idle" }, river: { status: "idle" } });
  const busy = Object.values(lanes).some((l) => l.status === "running");

  useEffect(() => {
    fetch("/api/entities").then((r) => r.json()).then((x) => setEntities(x.entities ?? [])).catch(() => {});
  }, []);

  const run = (input: Input) => {
    const started = Date.now();
    for (const w of WRITERS) {
      setLanes((l) => ({ ...l, [w.key]: { status: "running", started } }));
      fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, writer: w.key }) })
        .then((r) => r.json())
        .then((x) => setLanes((l) => ({ ...l, [w.key]: x.error ? { status: "error", error: x.error } : { status: "done", result: x } })))
        .catch((e) => setLanes((l) => ({ ...l, [w.key]: { status: "error", error: String(e) } })));
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {WRITERS.map((w) => (
          <LaneCard key={w.key} lane={lanes[w.key]!} w={w} />
        ))}
      </div>

      <form
        className="rounded-2xl border bg-card p-3 shadow-[var(--card-shadow)]"
        onSubmit={(e) => {
          e.preventDefault();
          run(brief.trim() ? { brief } : { entity });
        }}
      >
        <Textarea
          className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Paste data for an infographic, or leave empty to use the brain's notes for the company below"
          value={brief}
        />
        <div className="flex items-center gap-2 pt-2">
          <Select onValueChange={setEntity} value={entity}>
            <SelectTrigger className="h-8 max-w-64 rounded-full text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>{e.split("/").pop()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-muted-foreground text-xs">Same prompt compiler, same Hy Image render, same fact-check</span>
          <Button aria-label="Generate" className="rounded-full" disabled={busy} size="icon" type="submit">
            <ArrowUpIcon />
          </Button>
        </div>
      </form>

      <section aria-label="Sample prompts" className="grid gap-2 sm:grid-cols-3">
        {STARTERS.map((s) => (
          <button
            className="group flex flex-col items-start gap-1 rounded-xl border bg-card/60 p-4 text-left transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:shadow-[0_0_0_2px_var(--ring)] focus-visible:outline-none active:scale-[0.98] disabled:opacity-50 [@media(hover:hover)]:hover:bg-card"
            disabled={busy}
            key={s.title}
            onClick={() => {
              if (s.input.entity) {
                setEntity(s.input.entity);
                setBrief("");
              } else setBrief(s.input.brief!);
              run(s.input);
            }}
            type="button"
          >
            <span className="flex w-full items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
              {s.kicker}
              <ArrowUpRightIcon className="size-3.5" />
            </span>
            <span className="font-display text-lg uppercase leading-tight">{s.title}</span>
            <span className="text-muted-foreground text-xs">{s.detail}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
