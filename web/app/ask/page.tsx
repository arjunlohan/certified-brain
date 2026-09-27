"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircleIcon, ArrowUpIcon, ChevronDownIcon, DatabaseIcon, SparklesIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { int, pct, usd } from "@/lib/fmt";
import { cn } from "@/lib/utils";

type Finding = { text: string; stale: boolean; fresh: boolean };
type Lane = {
  name: "stock" | "reuse_all" | "certified";
  calls: number;
  costUsd: number;
  seconds: number;
  staleCount: number;
  findings: Finding[];
  staleDetail: string[];
  answer: string;
};
type Brain = {
  cells: number;
  stock: { calls: number; costUsd: number; stale: number };
  reuse_all: { calls: number; costUsd: number; stale: number };
  certified: { calls: number; costUsd: number; stale: number; reusedPct: number };
  metered: boolean;
};
type AskResponse = { entity: string; question: string; edit: string; alpha: number; pairs: number; results: Lane[]; brain: Brain };
type Turn = { id: number; question: string; entity: string; editLabel: string; result?: AskResponse; error?: string };

const DEFAULT_ENTITY = "customers/continental-retail-group";
const STARTERS = [
  "What is the current status, and is anything contradictory?",
  "Who owns this account right now, and has that changed?",
  "What are the open risks or disputed facts?",
];
const LANES: Record<Lane["name"], { letter: string; title: string; blurb: string; border: string }> = {
  stock: { letter: "A", title: "Stock GBrain", blurb: "Re-judges every cached verdict", border: "border-t-muted-foreground/40" },
  reuse_all: { letter: "B", title: "Reuse all", blurb: "Old cache, no version check", border: "border-t-destructive" },
  certified: { letter: "C", title: "Certified", blurb: "Reuses only certified strata", border: "border-t-emerald-600 dark:border-t-emerald-400" },
};
const CARD = "rounded-2xl border bg-card text-card-foreground shadow-[var(--card-shadow)]";
const GOOD = "text-emerald-600 dark:text-emerald-400";

export default function AskPage() {
  const [entities, setEntities] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, { label: string }>>({});
  const [entity, setEntity] = useState(DEFAULT_ENTITY);
  const [edit, setEdit] = useState("3-sem");
  const [question, setQuestion] = useState(STARTERS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((d: { entities: string[]; edits: Record<string, { label: string }> }) => {
        setEntities(d.entities);
        setEdits(d.edits);
        if (!d.entities.includes(DEFAULT_ENTITY) && d.entities[0]) setEntity(d.entities[0]);
        if (!d.edits["3-sem"]) setEdit(Object.keys(d.edits)[0] ?? "3-sem");
      })
      .catch(() => {});
  }, []);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || pending) return;
    const id = nextId.current++;
    const editLabel = edits[edit]?.label ?? edit;
    setTurns((t) => [{ id, question: text, entity, editLabel }, ...t]);
    setPending(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, question: text, edit, alpha: 0.1 }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, result: data as AskResponse } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(question);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(question);
    }
  }

  return (
    <>
      <PageHeader crumb="Ask the brain · A/B" kicker="Certified Brain · Ask" title="Ask the brain · A/B">
        <p>
          GBrain&apos;s contradiction judge just changed: a new prompt, or a swap to a judge model trained on River. The same question is
          answered three ways, side by side, each from the verdicts its cache policy serves.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <span className="font-medium text-foreground">A · Stock GBrain.</span> The cache key includes prompt version and model, so
            every cached verdict is re-judged. Correct, slow, expensive.
          </li>
          <li>
            <span className="font-medium text-destructive">B · Reuse all.</span> The old cache is served with no check. Free, but it
            serves stale verdicts.
          </li>
          <li>
            <span className={cn("font-medium", GOOD)}>C · Certified.</span> Reuse only the strata the sIVM certificate covers, re-judge
            the rest.
          </li>
        </ul>
        <p className="mt-3 text-xs">Answers are written by DeepSeek-V4-Flash on River. Each request takes roughly 10 to 40 seconds.</p>
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6">
        <form onSubmit={onSubmit} className={cn(CARD, "overflow-hidden")}>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about this entity..."
            aria-label="Question"
            className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 pt-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2.5">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger size="sm" className="max-w-full sm:max-w-80" aria-label="Entity">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                {(entities.length ? entities : [entity]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={edit} onValueChange={setEdit}>
              <SelectTrigger size="sm" aria-label="Change">
                <SelectValue placeholder="Change" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(edits).length
                  ? Object.entries(edits).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v.label}
                      </SelectItem>
                    ))
                  : [<SelectItem key={edit} value={edit}>{edit}</SelectItem>]}
              </SelectContent>
            </Select>
            <span className="ml-auto hidden font-mono text-muted-foreground text-xs sm:inline">α = 0.1</span>
            <Button type="submit" size="icon-sm" className="rounded-full" disabled={pending || !question.trim()} aria-label="Ask">
              {pending ? <Spinner /> : <ArrowUpIcon />}
            </Button>
          </div>
        </form>

        <div className="-mt-6 flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal rounded-full py-1.5 text-left text-xs"
              disabled={pending}
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
            >
              <SparklesIcon className="text-signal" />
              {s}
            </Button>
          ))}
        </div>

        {turns.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground text-sm">
            Ask a question, or pick a starter above. Newest turns appear on top.
          </div>
        ) : (
          <div className="space-y-12">
            {turns.map((t) => (
              <TurnView key={t.id} turn={t} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const r = turn.result;
  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-secondary-foreground">
          <p className="whitespace-pre-wrap">{turn.question}</p>
          <p className="mt-1 font-mono text-muted-foreground text-xs">
            {turn.entity} · {turn.editLabel}
          </p>
        </div>
      </div>

      {turn.error ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Request failed</p>
            <p className="mt-0.5 text-muted-foreground">{turn.error}</p>
          </div>
        </div>
      ) : !r ? (
        <>
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner /> Re-judging, reusing and certifying. A River model is writing three answers.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {(["stock", "reuse_all", "certified"] as const).map((n) => (
              <div key={n} className={cn(CARD, "space-y-3 border-t-4 p-5", LANES[n].border)}>
                <p className="font-display text-lg uppercase tracking-wide">
                  {LANES[n].letter} · {LANES[n].title}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {r.results.map((lane) => (
              <LaneCard key={lane.name} lane={lane} metered={r.brain.metered} />
            ))}
          </div>
          <BrainLine r={r} />
        </>
      )}
    </section>
  );
}

function LaneCard({ lane, metered }: { lane: Lane; metered: boolean }) {
  const meta = LANES[lane.name];
  const stale = lane.staleCount;
  return (
    <article className={cn(CARD, "flex flex-col gap-4 border-t-4 p-5", meta.border)}>
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg uppercase leading-tight tracking-wide">
            {meta.letter} · {meta.title}
          </h3>
          <Badge
            variant="outline"
            className={cn(stale ? "border-destructive/50 text-destructive" : cn("border-emerald-600/50 dark:border-emerald-400/50", GOOD))}
          >
            {stale ? `${int(stale)} stale verdict${stale === 1 ? "" : "s"}` : "no stale verdicts"}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">{meta.blurb}</p>
      </header>

      <div className="grid grid-cols-3 gap-2 tabular-nums">
        <Metric value={int(lane.calls)} label="judge calls" />
        <Metric value={metered ? usd(lane.costUsd, 4) : "not metered"} label="judge cost" small={!metered} />
        <Metric value={`${lane.seconds.toFixed(1)}s`} label="judge time" />
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderBold(lane.answer)}</p>

      <Collapsible className="mt-auto">
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-left text-muted-foreground text-xs hover:text-foreground">
          <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
          {lane.findings.length} flagged pair{lane.findings.length === 1 ? "" : "s"} this answer used
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <ul className="space-y-1 font-mono text-xs">
            {lane.findings.length ? (
              lane.findings.map((f, i) => (
                <li key={i} className={cn("flex items-baseline justify-between gap-2", f.stale && "text-destructive")}>
                  <span className="break-words">{f.text}</span>
                  {f.stale ? <span className="shrink-0 font-semibold uppercase">stale</span> : null}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">none</li>
            )}
          </ul>
          {lane.staleDetail.length ? (
            <ul className="mt-2 space-y-1 border-destructive/40 border-l-2 pl-2 font-mono text-destructive text-xs">
              {lane.staleDetail.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

function Metric({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-2">
      <div className={cn("font-display leading-none", small ? "text-sm text-muted-foreground" : "text-base lg:text-xl", "truncate")} title={value}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function BrainLine({ r }: { r: AskResponse }) {
  const b = r.brain;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card/50 px-4 py-3 text-muted-foreground text-sm">
      <DatabaseIcon className="mt-0.5 size-4 shrink-0 text-signal" />
      <p>
        <span className="font-medium text-foreground">Whole brain after this change</span> ({int(b.cells)} cached verdicts, α = {r.alpha}):
        stock {int(b.stock.calls)} calls{b.metered ? ` · ${usd(b.stock.costUsd, 4)}` : ""}, 0 stale · reuse all 0 calls,{" "}
        <span className="font-semibold text-destructive">{int(b.reuse_all.stale)} stale</span> · certified {int(b.certified.calls)} calls
        {b.metered ? ` · ${usd(b.certified.costUsd, 4)}` : ""},{" "}
        <span className={cn("font-semibold", b.certified.stale ? "text-destructive" : GOOD)}>{int(b.certified.stale)} stale</span> (
        <span className={cn("font-semibold", GOOD)}>{pct(b.certified.reusedPct)}</span> reused under the certificate). This entity:{" "}
        {int(r.pairs)} cached pairs.
      </p>
    </div>
  );
}

/** Answers come back with **bold** markdown; render it as <strong> without injecting HTML. */
function renderBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
