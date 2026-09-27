"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Section, Stat } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { Config, Floor, Stratum } from "@/lib/data";
import { int, pct, usd } from "@/lib/fmt";
import { cn } from "@/lib/utils";

const CHANGES = [
  { edit: "Semantic prompt edit", short: "Rule change", group: "Change the judge's prompt", to: "3-sem", what: "The judge's instructions gain a new rule about dates and small metric drops." },
  { edit: "Formatting-only prompt edit", short: "Formatting only", group: "Change the judge's prompt", to: "2-fmt", what: "Same rules, just reworded and numbered. Looks harmless." },
  { edit: "Swap to owned 9B (trained)", short: "Our trained model", group: "Change the judge's model", to: "9b-sft", what: "Replace the judge with a small model we trained on River." },
  { edit: "Swap to 9B (untrained)", short: "Same model, untrained", group: "Change the judge's model", to: "9b-base", what: "Our small model before any training." },
  { edit: "Same model, owned weights (River)", short: "Same model, our weights", group: "Change the judge's model", to: "dsv4", what: "The same DeepSeek model, but weights we host on River." },
  { edit: "Same model, trained on River", short: "DeepSeek, fine-tuned", group: "Change the judge's model", to: "dsv4-sft", what: "The same DeepSeek model after our fine-tune on River." },
] as const;
const ALPHAS = [0.05, 0.1, 0.2];
const LANES = [
  { key: "reuse", name: "Reuse everything", sub: "free, but serves stale answers", border: "border-t-destructive" },
  { key: "stock", name: "Stock GBrain", sub: "re-judges everything", border: "border-t-muted-foreground" },
  { key: "cert", name: "Certified", sub: "samples, keeps what passes", border: "border-t-emerald-500" },
] as const;
type LaneKey = (typeof LANES)[number]["key"];

// Cell states: 0 cached (untouched), 1 re-judged, 2 sampled by the certifier, 3 reused and still right, 4 reused but stale.
type Plan = { t: Int32Array; s: Uint8Array; total: number };
const label = (id: string) => id.split('"')[1] ?? id;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
function shuffled(n: number, rand: () => number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Turn one recorded certification run into a per-cell timeline on a shared judge-call clock. */
function plans(c: Config): Record<LaneKey, Plan> & { ends: number[] } {
  const n = c.once.cells;
  const mk = (): Plan => ({ t: new Int32Array(n), s: new Uint8Array(n), total: 0 });
  const reuse = mk(), stock = mk(), cert = mk();
  const rand = rng(7);
  let off = 0, clock = 0;
  const ends: number[] = [];
  for (const st of c.once.strata) {
    const perm = shuffled(st.size, rand);
    const stale = new Set(perm.slice(0, Math.round(st.trueFlipRate * st.size)));
    const sampled = st.looks.at(-1)?.n ?? 0;
    const order = shuffled(st.size, rand);
    const certStale = new Set(order.slice(sampled).filter((i) => stale.has(i)).slice(0, st.reusedWrong));
    // Pad with non-sampled cells if the recorded stale count exceeds the stale sample overlap.
    for (const i of order.slice(sampled)) if (certStale.size < st.reusedWrong) certStale.add(i);
    for (let k = 0; k < st.size; k++) {
      const cell = off + k;
      reuse.t[cell] = 0;
      reuse.s[cell] = stale.has(k) ? 4 : 3;
      stock.t[cell] = cell + 1;
      stock.s[cell] = 1;
    }
    order.forEach((k, rank) => {
      const cell = off + k;
      if (rank < sampled) {
        cert.t[cell] = clock + rank + 1;
        cert.s[cell] = 2;
      }
    });
    clock += sampled;
    order.slice(sampled).forEach((k, rank) => {
      const cell = off + k;
      if (st.certified) {
        cert.t[cell] = clock;
        cert.s[cell] = certStale.has(k) ? 4 : 3;
      } else {
        cert.t[cell] = clock + rank + 1;
        cert.s[cell] = 1;
      }
    });
    if (!st.certified) clock += st.size - sampled;
    ends.push(clock);
    off += st.size;
  }
  reuse.total = 0;
  stock.total = n;
  cert.total = clock;
  return { reuse, stock, cert, ends };
}

const PALETTE = {
  light: ["#e4e2dc", "#9a9ca6", "#d0a41c", "#2f7a4f", "#c2412d"],
  dark: ["#2c2d34", "#686a75", "#f4dc55", "#57b886", "#f07a63"],
};

function Lane({ plan, clock, cells }: { plan: Plan; clock: number; cells: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const size = cells > 3000 ? 5 : 7;
    const cols = Math.floor(width / size);
    const rows = Math.ceil(cells / cols);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cols * size * dpr;
    canvas.height = rows * size * dpr;
    canvas.style.width = `${cols * size}px`;
    canvas.style.height = `${rows * size}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const colors = document.documentElement.classList.contains("dark") ? PALETTE.dark : PALETTE.light;
    for (let i = 0; i < cells; i++) {
      const state = plan.t[i]! <= clock ? plan.s[i]! : 0;
      ctx.fillStyle = colors[state]!;
      ctx.fillRect((i % cols) * size, Math.floor(i / cols) * size, size - 1, size - 1);
    }
  }, [plan, clock, cells, width]);
  return <canvas aria-hidden className="block" ref={ref} />;
}

function laneStats(plan: Plan, clock: number) {
  let stale = 0, reused = 0;
  for (let i = 0; i < plan.t.length; i++) {
    if (plan.t[i]! > clock) continue;
    if (plan.s[i] === 4) stale++;
    if (plan.s[i] === 3 || plan.s[i] === 4) reused++;
  }
  return { calls: Math.min(clock, plan.total), stale, reused, done: clock >= plan.total };
}

function Legend() {
  const items = [
    ["Cached, not yet checked", 0],
    ["Re-judged by the new judge", 1],
    ["Sampled by the certifier", 2],
    ["Reused, still correct", 3],
    ["Reused, stale", 4],
  ] as const;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
      {items.map(([name, i]) => (
        <span className="flex items-center gap-1.5" key={name}>
          <span className="inline-block size-2.5 rounded-[2px]" style={{ background: PALETTE.light[i] }} />
          {name}
        </span>
      ))}
    </div>
  );
}

type Example = { pair_id: string; old: string; new: string; confidence: number | null; a: { title: string; text: string; effective_date: string | null }; b: { title: string; text: string; effective_date: string | null } };

function Drilldown({ to, stratum, onClose }: { to: string; stratum: Stratum | null; onClose: () => void }) {
  const [rows, setRows] = useState<Example[] | null>(null);
  const [changed, setChanged] = useState(true);
  useEffect(() => {
    if (!stratum) return;
    setRows(null);
    fetch(`/api/flips?to=${to}&cached=${label(stratum.id)}&changed=${changed ? 1 : 0}`)
      .then((r) => r.json())
      .then((x) => setRows(Array.isArray(x) ? x : []))
      .catch(() => setRows([]));
  }, [to, stratum, changed]);
  return (
    <Sheet onOpenChange={(o) => !o && onClose()} open={!!stratum}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display text-xl uppercase tracking-wide">Cached as {stratum ? label(stratum.id).replace(/_/g, " ") : ""}</SheetTitle>
          <SheetDescription>
            Real pairs from the brain. The cached verdict came from GBrain's judge before the change; the new verdict is what the changed judge says.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 px-4">
          <Button onClick={() => setChanged(true)} size="sm" variant={changed ? "default" : "outline"}>Verdict flipped</Button>
          <Button onClick={() => setChanged(false)} size="sm" variant={changed ? "outline" : "default"}>Verdict held</Button>
        </div>
        <div className="space-y-3 px-4 pb-6">
          {rows === null ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner /> Loading pairs</div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pairs in this group.</p>
          ) : (
            rows.map((r) => (
              <div className="space-y-2 rounded-xl border bg-card p-3 text-sm" key={r.pair_id}>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <Badge variant="outline">cached: {r.old}</Badge>
                  <span>→</span>
                  <Badge className={r.old !== r.new ? "border-destructive text-destructive" : ""} variant="outline">now: {r.new}</Badge>
                </div>
                {[r.a, r.b].map((p, i) => (
                  <div className="rounded-lg bg-muted/60 p-2" key={i}>
                    <p className="font-medium text-xs">{p.title} <span className="text-muted-foreground">· {p.effective_date ?? "undated"}</span></p>
                    <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{p.text}</p>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ReuseReplay({ configs }: { configs: Config[]; floors?: Floor[] }) {
  const [change, setChange] = useState<(typeof CHANGES)[number]>(CHANGES[0]);
  const [alpha, setAlpha] = useState(0.1);
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drill, setDrill] = useState<Stratum | null>(null);
  const cfg = configs.find((c) => c.edit === change.edit && c.alpha === alpha)!;
  const p = useMemo(() => plans(cfg), [cfg]);
  const cells = cfg.once.cells;
  const raf = useRef(0);

  const play = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setClock(cells);
      return;
    }
    setPlaying(true);
    const start = performance.now();
    const from = clock >= cells ? 0 : clock;
    const ms = 9000 * ((cells - from) / cells);
    const tick = (now: number) => {
      const k = Math.min(cells, from + ((now - start) / ms) * (cells - from));
      setClock(Math.floor(k));
      if (k < cells) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  }, [cells, clock]);
  const pause = () => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
  };
  // Picking a change (or the first load) replays it from the start, so the race runs without a click.
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    setClock(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      setClock(cells);
      return;
    }
    setPlaying(true);
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const k = Math.min(cells, ((now - start) / 9000) * cells);
      setClock(Math.floor(k));
      if (k < cells) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    const t = setTimeout(() => (raf.current = requestAnimationFrame(tick)), 600);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf.current);
    };
  }, [cfg, cells]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const metered = cfg.costPerCall > 0;
  const staleAll = cfg.once.strata.reduce((a, s) => a + Math.round(s.trueFlipRate * s.size), 0);
  const certCalls = cells - cfg.once.reused;

  // Which look has each stratum reached at the current clock (for the bound bars)?
  const lookAt = (i: number) => {
    const st = cfg.once.strata[i]!;
    const start = i === 0 ? 0 : p.ends[i - 1]!;
    const done = clock - start;
    let j = -1;
    st.looks.forEach((l, k) => {
      if (done >= l.n) j = k;
    });
    return j;
  };

  const at01 = (edit: string) => configs.find((c) => c.edit === edit && c.alpha === 0.1)!;
  const swaps = CHANGES.filter((c) => c.group === "Change the judge's model").map((c) => ({ ...c, cfg: at01(c.edit) }));
  const [guess, setGuess] = useState<string | null>(null);
  const fmt = at01("Formatting-only prompt edit"), sem = at01("Semantic prompt edit");
  const ncFlip = (c: Config) => c.once.strata.find((s) => label(s.id) === "no_contradiction")!.trueFlipRate;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-8 sm:px-6">
      <Section eyebrow="01 · The replay" title="Three caches, one change">
        <div className="flex flex-wrap items-end gap-6">
          {(["Change the judge's prompt", "Change the judge's model"] as const).map((g) => (
            <div className="space-y-1.5" key={g}>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">{g}</p>
              <div className="flex flex-wrap gap-1.5">
                {CHANGES.filter((c) => c.group === g).map((c) => (
                  <Button key={c.edit} onClick={() => setChange(c)} size="sm" variant={c === change ? "default" : "outline"}>
                    {c.short}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs uppercase tracking-wider">Max wrong verdicts allowed</p>
            <div className="flex gap-1.5">
              {ALPHAS.map((a) => (
                <Button key={a} onClick={() => setAlpha(a)} size="sm" variant={a === alpha ? "default" : "outline"}>{a * 100}%</Button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex gap-1.5">
            {playing ? (
              <Button onClick={pause} variant="secondary"><PauseIcon /> Pause</Button>
            ) : (
              <Button onClick={play}>{clock >= cells ? <RotateCcwIcon /> : <PlayIcon />} {clock >= cells ? "Replay" : "Play"}</Button>
            )}
            <Button onClick={() => { pause(); setClock(cells); }} size="icon" variant="outline" aria-label="Skip to end"><SkipForwardIcon /></Button>
          </div>
        </div>

        <p className="text-sm"><b>{change.short}:</b> <span className="text-muted-foreground">{change.what}</span></p>

        <div className="grid gap-4 md:grid-cols-3">
          {LANES.map((lane) => {
            const plan = p[lane.key];
            const s = laneStats(plan, clock);
            return (
              <div className={cn("space-y-3 rounded-2xl border border-t-4 bg-card p-4 shadow-[var(--card-shadow)]", lane.border)} key={lane.key}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg uppercase leading-tight tracking-wide">{lane.name}</p>
                    <p className="text-muted-foreground text-xs">{lane.sub}</p>
                  </div>
                  {s.done ? (
                    <Badge className={s.stale ? "border-destructive text-destructive" : "border-emerald-600 text-emerald-700 dark:text-emerald-400"} variant="outline">
                      {s.stale ? `${int(s.stale)} stale served` : "done · 0 stale"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{clock === 0 ? "ready" : "judging…"}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                  <div className="rounded-lg bg-muted p-2"><div className="font-display text-xl">{int(s.calls)}</div><div className="text-[11px] text-muted-foreground">judge calls</div></div>
                  <div className="rounded-lg bg-muted p-2"><div className="font-display text-xl">{metered ? usd(s.calls * cfg.costPerCall) : "n/a"}</div><div className="text-[11px] text-muted-foreground">{metered ? "judge cost" : "River, not metered"}</div></div>
                  <div className="rounded-lg bg-muted p-2"><div className="font-display text-xl">{pct(s.reused / cells, 0)}</div><div className="text-[11px] text-muted-foreground">reused</div></div>
                </div>
                <div><Lane cells={cells} clock={clock} plan={plan} /></div>
              </div>
            );
          })}
        </div>
        <Legend />
        <p className="text-muted-foreground text-xs">
          1 square = 1 cached verdict. Recorded run, all lanes on the same judge-call clock.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="wrong verdicts served if you reuse everything" tone="bad" value={int(staleAll)} />
          <Stat label={`wrong verdicts served with the certificate (budget ${alpha * 100}%)`} tone="good" value={int(cfg.once.presentedError * cells)} />
          <Stat label={`judge calls with the certificate (stock: ${int(cells)})`} tone="signal" value={int(certCalls)} />
          <Stat label={`budget breaches in ${int(cfg.rep.runs)} reruns`} tone="good" value={int(cfg.rep.exceedances)} />
        </div>
      </Section>

      <Section eyebrow="02 · Per group" title="Kept or re-checked">
        <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-[var(--card-shadow)]">
          {cfg.once.strata.map((st, i) => {
            const j = lookAt(i);
            const look = j >= 0 ? st.looks[j]! : null;
            const decided = j === st.looks.length - 1;
            const w = (x: number) => `${Math.min(100, (x / 0.5) * 100)}%`;
            return (
              <button
                className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors duration-[var(--duration-fast)] hover:bg-muted/50"
                key={st.id}
                onClick={() => setDrill(st)}
                type="button"
              >
                <span className="w-44 shrink-0 truncate text-sm">{label(st.id).replace(/_/g, " ")}</span>
                <span className="relative h-1.5 flex-1 rounded-full bg-muted">
                  {look ? <span className={cn("block h-1.5 rounded-full transition-[width] duration-[var(--duration-base)]", look.upperBound <= alpha ? "bg-emerald-500" : "bg-signal")} style={{ width: w(look.upperBound) }} /> : null}
                  <span className="absolute -top-1 h-3.5 w-0.5 bg-destructive" style={{ left: w(alpha) }} />
                </span>
                <span className="w-24 shrink-0 text-right">
                  {!decided ? (
                    <span className="text-muted-foreground text-xs">sampling</span>
                  ) : st.certified ? (
                    <Badge className="border-emerald-600 text-emerald-700 dark:text-emerald-400" variant="outline">kept</Badge>
                  ) : (
                    <Badge className="border-signal text-signal" variant="outline">re-checked</Badge>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="03 · Guess" title="Which change breaks more answers?">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "fmt", name: "Formatting only" },
            { key: "sem", name: "Rule change" },
          ].map((o) => (
            <Button key={o.key} onClick={() => setGuess(o.key)} size="lg" variant={guess === o.key ? "default" : "outline"}>
              {o.name}
            </Button>
          ))}
        </div>
        {guess ? (
          <p className="max-w-3xl text-sm">
            <b>{guess === "fmt" ? "Right." : "Most people pick this."}</b> The harmless-looking reformat flipped {pct(ncFlip(fmt))} of the biggest group, the rule change only {pct(ncFlip(sem))}.
          </p>
        ) : null}
      </Section>

      <Section eyebrow="04 · Own the judge" title="Swap in a model you trained">
        <div className="grid gap-3 sm:grid-cols-3">
          {swaps
            .filter((s) => s.to !== "dsv4")
            .sort((x, y) => ["9b-sft", "9b-base", "dsv4-sft"].indexOf(x.to) - ["9b-sft", "9b-base", "dsv4-sft"].indexOf(y.to))
            .map((s) => {
              const r = s.cfg.rep.savingsMean;
              const name = s.to === "9b-sft" ? "Our trained model" : s.to === "9b-base" ? "Same model, untrained" : "Big model after our fine-tune";
              return <Stat key={s.edit} label={`${name} keeps this much of the cache (average of 1,000 reruns)`} tone={s.to === "9b-sft" ? "signal" : r === 0 ? "bad" : undefined} value={pct(r)} />;
            })}
        </div>
      </Section>

      <Drilldown onClose={() => setDrill(null)} stratum={drill} to={change.to} />
    </div>
  );
}
