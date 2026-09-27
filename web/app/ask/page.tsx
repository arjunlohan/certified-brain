"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircleIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
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

const DEFAULT_ENTITY = "vendors/edge-compute-partners";
const DEFAULT_EDIT = "3-sem";
/** Demo labels for the edit keys served by /api/entities. */
const EDIT_LABELS: Record<string, string> = {
  "3-sem": "New judge instructions (a rule change)",
  "2-fmt": "New judge instructions (reworded only)",
  "swap-9b": "New judge model (our own trained model)",
};
/** Picked by scripts/find-showcase.ts: rule change, reuse everything serves several wrong answers, certified serves none for a fraction of the calls. */
const STARTERS = [
  {
    kicker: "Rule change",
    title: "Edge Compute Partners",
    detail: "Reuse everything serves 4 wrong answers here. Certified: 0 wrong, 5 of 15 calls.",
    entity: "vendors/edge-compute-partners",
    edit: "3-sem",
    question: "Is our contract with Edge Compute Partners still on the original pricing, and when will the 500 units arrive?",
  },
  {
    kicker: "Rule change",
    title: "Fleet Manager uptime",
    detail: "Reuse everything serves 3 wrong answers here. Certified: 0 wrong, 4 of 15 calls.",
    entity: "products/northwind-fleet-manager",
    edit: "3-sem",
    question: "What is Fleet Manager's real uptime now, and who owns the product?",
  },
  {
    kicker: "Rule change",
    title: "What does Sofia run?",
    detail: "Reuse everything serves 4 wrong answers here. Certified: 0 wrong, 7 of 15 calls.",
    entity: "people/sofia-rossi",
    edit: "3-sem",
    question: "What is Sofia Rossi responsible for now, and what was Q4 revenue?",
  },
] as const;
const LANES: Record<Lane["name"], { title: string; blurb: string; dot: string; bar: string }> = {
  stock: {
    title: "Stock GBrain",
    blurb: "Throws away every saved answer and asks the AI judge again. Always right, pays for every call.",
    dot: "bg-muted-foreground/60",
    bar: "bg-muted-foreground/50",
  },
  reuse_all: {
    title: "Reuse everything",
    blurb: "Keeps every saved answer from before the change, no checking. Free, but some answers are now wrong (stale).",
    dot: "bg-destructive",
    bar: "bg-destructive",
  },
  certified: {
    title: "Certified",
    blurb:
      "Re-checks a random sample of each group of saved answers; keeps a group only if the sample proves it still holds, re-asks the rest. Near-free, and wrong answers stay under a 10% budget.",
    dot: "bg-emerald-600 dark:bg-emerald-400",
    bar: "bg-emerald-600 dark:bg-emerald-400",
  },
};
const GOOD = "text-emerald-600 dark:text-emerald-400";
const SHIMMER_CSS = `
.ask-shimmer{background:linear-gradient(90deg,var(--muted-foreground) 0%,var(--muted-foreground) 40%,var(--foreground) 50%,var(--muted-foreground) 60%,var(--muted-foreground) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:ask-shimmer 2s linear infinite}
@keyframes ask-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}
@media (prefers-reduced-motion:reduce){.ask-shimmer{animation:none;color:var(--muted-foreground)}}
`;

const editLabel = (key: string, fallback?: string) => EDIT_LABELS[key] ?? fallback ?? key;

export default function AskPage() {
  const [entities, setEntities] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, { label: string }>>({});
  const [entity, setEntity] = useState(DEFAULT_ENTITY);
  const [edit, setEdit] = useState(DEFAULT_EDIT);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const lastTurnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/entities")
      .then((r) => r.json())
      .then((d: { entities: string[]; edits: Record<string, { label: string }> }) => {
        setEntities(d.entities);
        setEdits(d.edits);
        if (!d.entities.includes(DEFAULT_ENTITY) && d.entities[0]) setEntity(d.entities[0]);
        if (!d.edits[DEFAULT_EDIT]) setEdit(Object.keys(d.edits)[0] ?? DEFAULT_EDIT);
      })
      .catch(() => {});
  }, []);

  // Each new question anchors near the top; the answer lands below it.
  useEffect(() => {
    lastTurnRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [turns.length]);

  async function ask(q: string, ent = entity, ed = edit) {
    const text = q.trim();
    if (!text || pending) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: text, entity: ent, editLabel: editLabel(ed, edits[ed]?.label) }]);
    setQuestion("");
    setPending(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity: ent, question: text, edit: ed, alpha: 0.1 }),
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

  function pickStarter(s: (typeof STARTERS)[number]) {
    const ent = entities.length && !entities.includes(s.entity) ? entity : s.entity;
    setEntity(ent);
    setEdit(s.edit);
    ask(s.question, ent, s.edit);
  }

  const composer = (
    <Composer
      question={question}
      onQuestion={setQuestion}
      entity={entity}
      onEntity={setEntity}
      entities={entities}
      edit={edit}
      onEdit={setEdit}
      edits={edits}
      pending={pending}
      onAsk={() => ask(question)}
    />
  );

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <style>{SHIMMER_CSS}</style>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator className="mr-1 data-[orientation=vertical]:h-4" orientation="vertical" />
        <h1 className="min-w-0 flex-1 truncate font-medium text-sm">Ask the brain · A/B</h1>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {turns.length ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div aria-busy={pending} className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-6 pb-72 sm:px-6">
                {turns.map((t, i) => (
                  <div key={t.id} ref={i === turns.length - 1 ? lastTurnRef : undefined} className="scroll-mt-4">
                    <TurnView turn={t} />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-3xl bg-gradient-to-t from-background via-background to-transparent px-4 pt-4 pb-6 sm:px-6">
              {composer}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-6">
              <header className="space-y-4">
                <h2 className="font-display font-semibold text-5xl uppercase leading-[0.95] tracking-tight sm:text-6xl">
                  Ask the <span className="text-signal">brain</span>
                </h2>
                <p className="max-w-xl text-muted-foreground text-pretty">
                  The AI judge just changed. Ask one question and see it answered three ways: ask the judge again for everything, reuse every
                  saved answer, or reuse only the saved answers a sample proves are still right.
                </p>
              </header>
              {composer}
              <section aria-label="Examples" className="grid gap-2 sm:grid-cols-3">
                {STARTERS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    disabled={pending}
                    onClick={() => pickStarter(s)}
                    className="group flex flex-col items-start gap-1 rounded-xl border bg-card/60 p-4 text-left transition-[background-color,transform] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_var(--ring)] focus-visible:outline-none active:scale-[0.98] disabled:opacity-60 [@media(hover:hover)]:hover:bg-card"
                  >
                    <span className="flex w-full items-center justify-between text-muted-foreground text-xs uppercase tracking-wider">
                      {s.kicker}
                      <ArrowUpRightIcon className="size-3.5 transition-transform duration-150 [@media(hover:hover)]:group-hover:-translate-y-0.5 [@media(hover:hover)]:group-hover:translate-x-0.5" />
                    </span>
                    <span className="font-display text-lg uppercase leading-tight">{s.title}</span>
                    <span className="text-muted-foreground text-xs">{s.detail}</span>
                  </button>
                ))}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Composer(props: {
  question: string;
  onQuestion: (q: string) => void;
  entity: string;
  onEntity: (e: string) => void;
  entities: string[];
  edit: string;
  onEdit: (e: string) => void;
  edits: Record<string, { label: string }>;
  pending: boolean;
  onAsk: () => void;
}) {
  const { question, onQuestion, entity, onEntity, entities, edit, onEdit, edits, pending, onAsk } = props;
  const editKeys = Object.keys(edits).length ? Object.keys(edits) : [edit];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onAsk();
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onAsk();
    }
  }

  return (
    <form onSubmit={onSubmit} className="relative overflow-hidden rounded-2xl border bg-card shadow-[var(--card-shadow)]">
      <Textarea
        value={question}
        onChange={(e) => onQuestion(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about this entity…"
        aria-label="Question"
        className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 pt-4 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-1 px-2.5 pr-14 pb-2.5">
        <Select value={entity} onValueChange={(v) => v && onEntity(v)}>
          <SelectTrigger size="sm" className="max-w-full sm:max-w-64" aria-label="Entity">
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
        <Select value={edit} onValueChange={(v) => v && onEdit(v)}>
          <SelectTrigger size="sm" className="max-w-full" aria-label="Change">
            <SelectValue placeholder="Change" />
          </SelectTrigger>
          <SelectContent>
            {editKeys.map((k) => (
              <SelectItem key={k} value={k}>
                {editLabel(k, edits[k]?.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        size="icon-sm"
        className="absolute right-2.5 bottom-2.5 rounded-full"
        disabled={pending || !question.trim()}
        aria-label="Ask"
      >
        {pending ? <Spinner /> : <ArrowUpIcon />}
      </Button>
    </form>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const r = turn.result;
  return (
    <section className="flex flex-col gap-6">
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="secondary">
            <BubbleContent className="rounded-2xl px-4 py-2.5">
              <p className="whitespace-pre-wrap text-base">{turn.question}</p>
            </BubbleContent>
          </Bubble>
          <MessageFooter className="font-mono font-normal">
            {turn.entity} · {turn.editLabel}
          </MessageFooter>
        </MessageContent>
      </Message>

      {turn.error ? (
        <Message>
          <MessageContent>
            <div role="alert" className="flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Request failed</p>
                <p className="mt-0.5 text-muted-foreground">{turn.error}</p>
              </div>
            </div>
          </MessageContent>
        </Message>
      ) : !r ? (
        <Marker role="status">
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="ask-shimmer">Asking again, reusing and checking samples…</MarkerContent>
        </Marker>
      ) : (
        <div className="flex flex-col gap-3">
          <CostCompare lanes={r.results} metered={r.brain.metered} />
          <div className="grid gap-6 md:grid-cols-3 md:gap-4">
            {r.results.map((lane) => (
              <LaneMessage key={lane.name} lane={lane} metered={r.brain.metered} />
            ))}
          </div>
          <BrainLine r={r} />
        </div>
      )}
    </section>
  );
}

function LaneMessage({ lane, metered }: { lane: Lane; metered: boolean }) {
  const meta = LANES[lane.name];
  const stale = lane.staleCount;
  const n = lane.findings.length;
  return (
    <Message>
      <MessageContent className="gap-2">
        <MessageHeader className="gap-2 px-1">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", meta.dot)} />
          <span className="truncate text-foreground">{meta.title}</span>
          <Badge
            variant="outline"
            className={cn("ml-auto shrink-0", stale ? "border-destructive/50 text-destructive" : cn("border-emerald-600/50 dark:border-emerald-400/50", GOOD))}
          >
            {int(stale)} wrong
          </Badge>
        </MessageHeader>
        <p className="px-1 text-muted-foreground text-xs leading-snug text-pretty">{meta.blurb}</p>
        <Bubble variant="muted" className="w-full max-w-full">
          <BubbleContent className="w-full rounded-2xl px-4 py-3">
            <p className="whitespace-pre-wrap leading-relaxed">{renderBold(lane.answer)}</p>
          </BubbleContent>
        </Bubble>
        <MessageFooter className="px-1 font-normal tabular-nums">
          {int(lane.calls)} calls · {metered ? usd(lane.costUsd, 4) : "not metered"} · {lane.seconds.toFixed(1)}s
        </MessageFooter>
        <Collapsible className="px-1">
          <CollapsibleTrigger className="group flex items-center gap-1 text-left text-muted-foreground text-xs hover:text-foreground">
            <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            {n} conflict{n === 1 ? "" : "s"} flagged
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ul className="space-y-1 font-mono text-xs">
              {n ? (
                lane.findings.map((f, i) => (
                  <li key={i} className={cn("flex items-baseline justify-between gap-2", f.stale && "text-destructive")}>
                    <span className="break-words">{f.text}</span>
                    {f.stale ? <span className="shrink-0 font-semibold uppercase">wrong</span> : null}
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
      </MessageContent>
    </Message>
  );
}

/** One compact row per approach: judge calls as a bar, then cost and wrong answers. */
function CostCompare({ lanes, metered }: { lanes: Lane[]; metered: boolean }) {
  const max = Math.max(1, ...lanes.map((l) => l.calls));
  return (
    <div role="table" aria-label="Cost comparison" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card/60 px-3 py-2.5 text-xs tabular-nums">
      {lanes.map((l) => {
        const meta = LANES[l.name];
        return (
          <div key={l.name} role="row" className="contents">
            <span role="cell" className="font-medium">{meta.title}</span>
            <span role="cell" className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", meta.bar)} style={{ width: `${(l.calls / max) * 100}%` }} />
            </span>
            <span role="cell" className="text-right text-muted-foreground">
              {int(l.calls)} calls · {metered ? usd(l.costUsd, 4) : "not metered"} ·{" "}
              <span className={cn("font-semibold", l.staleCount ? "text-destructive" : GOOD)}>{int(l.staleCount)} wrong</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BrainLine({ r }: { r: AskResponse }) {
  const b = r.brain;
  return (
    <p className="px-1 text-muted-foreground text-xs tabular-nums">
      Whole brain · {int(b.cells)} saved answers: stock {int(b.stock.calls)} calls{b.metered ? `, ${usd(b.stock.costUsd, 4)}` : ""}, 0 wrong ·
      reuse everything 0 calls, <span className="font-semibold text-destructive">{int(b.reuse_all.stale)} wrong</span> · certified{" "}
      {int(b.certified.calls)} calls{b.metered ? `, ${usd(b.certified.costUsd, 4)}` : ""},{" "}
      <span className={cn("font-semibold", b.certified.stale ? "text-destructive" : GOOD)}>{int(b.certified.stale)} wrong</span>,{" "}
      <span className={cn("font-semibold", GOOD)}>{pct(b.certified.reusedPct)}</span> reused
    </p>
  );
}

/** Answers come back with **bold** markdown; render it as <strong> without injecting HTML. */
function renderBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
