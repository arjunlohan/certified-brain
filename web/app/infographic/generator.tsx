"use client";

import { ArrowRightIcon, ArrowUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Checks = { passed: number; total: number } | null;
type Side = { image?: string; verdict?: string; checks: Checks };
export type Run = { before: Side; after: Side; passes: number; specAttempts: number; seconds: { spec: number; loop: number } };
export type Sample = { title: string; detail: string; input: { entity?: string; brief?: string }; muse?: Run; river?: Run };

const WRITERS = [
  { key: "muse", name: "Muse Spark", sub: "rented, via Vercel AI Gateway", dot: "bg-muted-foreground" },
  { key: "river", name: "Our trained model", sub: "owned, trained on River", dot: "bg-signal" },
] as const;

function Shot({ side, label }: { side: Side; label: string }) {
  const ok = side.verdict === "publish";
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {side.checks ? (
          <Badge className={ok ? "border-emerald-600 text-emerald-700 dark:text-emerald-400" : "border-destructive text-destructive"} variant="outline">
            {side.checks.passed}/{side.checks.total} checks
          </Badge>
        ) : null}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <button className="block aspect-[3/4] w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted dark:bg-black/40" type="button">
            {side.image ? <img alt={label} className="size-full object-contain" src={side.image} /> : null}
          </button>
        </DialogTrigger>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-auto max-w-[calc(100vw-2rem)] flex-col items-center border-none bg-transparent p-0 shadow-none sm:max-w-[calc(100vw-4rem)]">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {side.image ? <img alt={label} className="max-h-[calc(100dvh-4rem)] w-auto rounded-lg object-contain" src={side.image} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WriterCard({ w, run, pending }: { w: (typeof WRITERS)[number]; run?: Run; pending?: number }) {
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]">
      <figcaption className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-base uppercase tracking-wide">
            <span className={`inline-block size-2 rounded-full ${w.dot}`} /> {w.name}
          </p>
          <p className="text-muted-foreground text-xs">{w.sub}</p>
        </div>
        {run ? <span className="text-muted-foreground text-xs tabular-nums">{run.passes} pass{run.passes > 1 ? "es" : ""}</span> : null}
      </figcaption>
      {run ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3">
          <Shot label="Before" side={run.before} />
          <ArrowRightIcon className="size-4 text-muted-foreground" />
          <Shot label="After" side={run.after} />
        </div>
      ) : (
        <div className="relative flex aspect-[3/2] items-center justify-center bg-muted dark:bg-black/40">
          {pending ? (
            <>
              <div aria-hidden className="studio-scan absolute inset-0" />
              <Elapsed since={pending} />
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Not generated yet</p>
          )}
        </div>
      )}
    </figure>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.round((now - since) / 1000);
  const stage = s < 15 ? "Writing the spec" : s < 45 ? "Rendering" : "Fact-checking and fixing";
  return <p className="relative text-muted-foreground text-sm">{stage}… {s}s</p>;
}

export function Generator({ samples }: { samples: Record<string, Sample> }) {
  const keys = Object.keys(samples);
  const [key, setKey] = useState(keys[0] ?? "live");
  const [live, setLive] = useState<{ muse?: Run; river?: Run; started?: number; error?: string } | null>(null);
  const [brief, setBrief] = useState("");
  const shown = key === "live" ? live : samples[key];

  const run = () => {
    if (!brief.trim()) return;
    const started = Date.now();
    setKey("live");
    setLive({ started });
    for (const w of WRITERS) {
      fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief, writer: w.key }) })
        .then((r) => r.json())
        .then((x) => setLive((l) => ({ ...l, ...(x.error ? { error: x.error } : { [w.key]: x }) })))
        .catch((e) => setLive((l) => ({ ...l, error: String(e) })));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <Button key={k} onClick={() => setKey(k)} size="sm" variant={k === key ? "default" : "outline"}>
            {samples[k]!.title}
          </Button>
        ))}
        {live ? (
          <Button onClick={() => setKey("live")} size="sm" variant={key === "live" ? "default" : "outline"}>Your prompt</Button>
        ) : null}
      </div>
      {key !== "live" && samples[key] ? <p className="text-muted-foreground text-sm">{samples[key]!.detail}</p> : null}
      {live?.error && key === "live" ? <p className="text-destructive text-sm">{live.error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {WRITERS.map((w) => (
          <WriterCard key={w.key} pending={key === "live" ? live?.started : undefined} run={shown?.[w.key]} w={w} />
        ))}
      </div>

      <form
        className={cn("rounded-2xl border bg-card p-3 shadow-[var(--card-shadow)]")}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Textarea
          className="min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Try your own: paste data for an infographic"
          value={brief}
        />
        <div className="flex items-center gap-2 pt-2">
          <span className="text-muted-foreground text-xs">Both models, same render and fact-check loop. Takes 2 to 4 minutes.</span>
          <Button aria-label="Generate" className="ml-auto rounded-full" disabled={!brief.trim()} size="icon" type="submit">
            <ArrowUpIcon />
          </Button>
        </div>
      </form>
    </div>
  );
}
