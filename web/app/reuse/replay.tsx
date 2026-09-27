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
  { edit: "Semantic prompt edit", short: "Semantic rule change", group: "Prompt edit", to: "3-sem" },
  { edit: "Formatting-only prompt edit", short: "Formatting-only edit", group: "Prompt edit", to: "2-fmt" },
  { edit: "Swap to owned 9B (trained)", short: "Qwen 9B, trained on River", group: "Judge swap", to: "9b-sft" },
  { edit: "Swap to 9B (untrained)", short: "Qwen 9B, untrained", group: "Judge swap", to: "9b-base" },
  { edit: "Same model, owned weights (River)", short: "DeepSeek V4 Flash on River", group: "Judge swap", to: "dsv4" },
  { edit: "Same model, trained on River", short: "DeepSeek V4 Flash, fine-tuned", group: "Judge swap", to: "dsv4-sft" },
] as const;
const ALPHAS = [0.05, 0.1, 0.2];
const LANES = [
  { key: "reuse", name: "Reuse everything", sub: "version check removed", border: "border-t-destructive" },
  { key: "stock", name: "Stock GBrain", sub: "re-judge every verdict", border: "border-t-muted-foreground" },
  { key: "cert", name: "Certified", sub: "reuse what the bound covers", border: "border-t-emerald-500" },
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

export function ReuseReplay({ configs, floors }: { configs: Config[]; floors: Floor[] }) {
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
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    setClock(0);
  }, [cfg]);
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
  const swaps = CHANGES.filter((c) => c.group === "Judge swap").map((c) => ({ ...c, cfg: at01(c.edit) }));
  const [guess, setGuess] = useState<string | null>(null);
  const fmt = at01("Formatting-only prompt edit"), sem = at01("Semantic prompt edit");
  const ncFlip = (c: Config) => c.once.strata.find((s) => label(s.id) === "no_contradiction")!.trueFlipRate;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-8 sm:px-6">
      <Section eyebrow="01 · The replay" title="Three caches, one change">
        <div className="flex flex-wrap items-end gap-6">
          {(["Prompt edit", "Judge swap"] as const).map((g) => (
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
            <p className="text-muted-foreground text-xs uppercase tracking-wider">Error budget α</p>
            <div className="flex gap-1.5">
              {ALPHAS.map((a) => (
                <Button key={a} onClick={() => setAlpha(a)} size="sm" variant={a === alpha ? "default" : "outline"}>{a}</Button>
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
                    <Badge variant="outline">judging…</Badge>
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
          Each square is one cached verdict ({int(cells)} for this change), grouped by cached verdict. The replay is recorded data (certification seed 1), not a live run:
          all three lanes advance on the same judge-call clock, so a lane that makes fewer calls finishes earlier at equal throughput. Stale counts are measured by
          re-judging every cell with the new judge. Stale squares inside a group are placed at random; their number is exact.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={`served stale by reuse-everything (${pct(cfg.once.populationFlipRate, 2)} of the cache)`} tone="bad" value={int(staleAll)} />
          <Stat label={`served stale by the certificate (${pct(cfg.once.presentedError, 2)}; budget α = ${alpha})`} tone="good" value={int(cfg.once.presentedError * cells)} />
          <Stat label={`judge calls with the certificate, vs ${int(cells)} for stock`} tone="signal" value={int(certCalls)} />
          <Stat label={`of ${int(cfg.rep.runs)} replications exceeded α (mean reuse ${pct(cfg.rep.savingsMean)})`} tone="good" value={int(cfg.rep.exceedances)} />
        </div>
      </Section>

      <Section eyebrow="02 · Inside the certificate" title="Every group is sampled until the bound clears α, or it is refused">
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-[var(--card-shadow)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              <tr className="border-b">
                <th className="px-4 py-3">Cached verdict</th>
                <th className="px-4 py-3 text-right">Cells</th>
                <th className="px-4 py-3">Upper bound on flip rate vs α</th>
                <th className="px-4 py-3 text-right">Sampled</th>
                <th className="px-4 py-3 text-right">Actual flip rate</th>
                <th className="px-4 py-3">Decision</th>
              </tr>
            </thead>
            <tbody>
              {cfg.once.strata.map((st, i) => {
                const j = lookAt(i);
                const look = j >= 0 ? st.looks[j]! : null;
                const decided = j === st.looks.length - 1;
                const w = (x: number) => `${Math.min(100, (x / 0.5) * 100)}%`;
                return (
                  <tr className="cursor-pointer border-b last:border-0 hover:bg-muted/50" key={st.id} onClick={() => setDrill(st)}>
                    <td className="px-4 py-3 font-mono text-xs">{label(st.id)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{int(st.size)}</td>
                    <td className="px-4 py-3">
                      <div className="relative h-3 w-56 rounded-full bg-muted">
                        {look ? <div className={cn("h-3 rounded-full transition-[width] duration-[var(--duration-base)]", look.upperBound <= alpha ? "bg-emerald-500" : "bg-signal")} style={{ width: w(look.upperBound) }} /> : null}
                        <div className="absolute -top-1 h-5 w-0.5 bg-destructive" style={{ left: w(alpha) }} title={`α = ${alpha}`} />
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {look ? `look ${j + 1}/${st.looks.length} · n=${look.n} · ${look.flips} flips · bound ${look.upperBound >= 0.999 ? "stopped (futility)" : look.upperBound.toFixed(3)}` : "waiting"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{int(st.looks.at(-1)?.n ?? 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pct(st.trueFlipRate)}</td>
                    <td className="px-4 py-3">
                      {!decided ? <span className="text-muted-foreground text-xs">sampling</span> : st.certified ? (
                        <Badge className="border-emerald-600 text-emerald-700 dark:text-emerald-400" variant="outline">certified · reuse {int(st.reused)}</Badge>
                      ) : (
                        <Badge className="border-signal text-signal" variant="outline">refused · re-judge</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Bound: empirical-Bernstein upper confidence bound on the flip rate, Bonferroni-corrected across groups and looks, looks on a doubling schedule from 45 samples.
          Bar scale 0 to 0.5; the red tick is α. Click a row to read real pairs whose verdict flipped.
        </p>
      </Section>

      <Section eyebrow="03 · Guess" title="Which edit is safer to reuse the cache across?">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: "fmt", name: "Formatting-only edit", desc: "Same rules, just unwrapped and numbered. Nothing semantic changed.", c: fmt },
            { key: "sem", name: "Semantic rule change", desc: "New rule: a metric drop under 10% is evolution; one-sided dates are never supersession.", c: sem },
          ].map((o) => (
            <button
              className={cn("space-y-2 rounded-2xl border bg-card p-4 text-left shadow-[var(--card-shadow)] transition-[background-color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.99]", guess === o.key && "ring-2 ring-ring")}
              key={o.key}
              onClick={() => setGuess(o.key)}
              type="button"
            >
              <p className="font-display text-lg uppercase tracking-wide">{o.name}</p>
              <p className="text-muted-foreground text-sm">{o.desc}</p>
              {guess ? (
                <p className="font-mono text-xs tabular-nums">
                  flips {pct(o.c.once.populationFlipRate)} overall · {pct(ncFlip(o.c))} of the big no_contradiction group · certified reuse {pct(o.c.once.reused / o.c.once.cells)} · {int(o.c.once.oracleCalls)} certification calls · realized error {pct(o.c.once.presentedError, 2)}
                </p>
              ) : null}
            </button>
          ))}
        </div>
        {guess ? (
          <p className="max-w-3xl text-sm">
            <b>{guess === "sem" ? "Right." : "Most people pick this one."}</b> The "harmless" formatting edit flipped {pct(ncFlip(fmt))} of the largest group; the rule change flipped only {pct(ncFlip(sem))} of it. The rule change reuses more, with fewer checks and a third of the error. You cannot eyeball which edit is safe. You have to measure it, and the certificate is that measurement.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Pick one, then the numbers appear (α = 0.1).</p>
        )}
      </Section>

      <Section eyebrow="04 · Own the judge" title="Swap GBrain's judge for a model you trained on River">
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-[var(--card-shadow)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
              <tr className="border-b">
                <th className="px-4 py-3">New judge (α = 0.1)</th>
                <th className="px-4 py-3 text-right">Agrees with old</th>
                <th className="px-4 py-3 text-right">Reused (seed 1)</th>
                <th className="px-4 py-3 text-right">Mean reuse, 1,000 runs</th>
                <th className="px-4 py-3 text-right">Judge calls</th>
                <th className="px-4 py-3 text-right">Realized error</th>
                <th className="px-4 py-3 text-right">Runs over α</th>
              </tr>
            </thead>
            <tbody>
              {swaps.map((s) => (
                <tr className="cursor-pointer border-b last:border-0 hover:bg-muted/50" key={s.edit} onClick={() => setChange(s)}>
                  <td className="px-4 py-3">{s.short}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(1 - s.cfg.once.populationFlipRate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(s.cfg.once.reused / s.cfg.once.cells)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(s.cfg.rep.savingsMean)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{int(s.cfg.once.cells - s.cfg.once.reused)} / {int(s.cfg.once.cells)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(s.cfg.once.presentedError, 2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.cfg.rep.exceedances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-muted-foreground text-sm">
          <li>The untrained 9B inherits nothing: every group is refused. Training it on River on 1,500 of the teacher's verdicts lifts agreement and lets it inherit the big group with a certificate.</li>
          <li>Fine-tuning DeepSeek V4 Flash on River made it worse (lower agreement). The certifier handed it far less of the cache: nothing on seed 1, {pct(swaps[3]!.cfg.rep.savingsMean)} on average across 1,000 runs.</li>
          <li>Equal reuse percentages across judges are structural, not a coincidence: reuse comes in whole-group steps. Compare judges on calls and realized error instead.</li>
        </ul>
        <div className="grid gap-3 sm:grid-cols-4">
          {floors.map((f) => (
            <Stat
              key={f.mode}
              label={
                <>
                  self-flip floor · {f.model.replace("@any-host", " (any host)")} · {f.hosts.length} host{f.hosts.length > 1 ? "s" : ""}: {f.hosts.map((h) => h.provider).join(", ")}
                </>
              }
              tone={f.hosts.length > 1 ? "bad" : undefined}
              value={pct(f.selfFlip)}
            />
          ))}
        </div>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Self-flip floor: the same judge asked the same question twice at temperature 0. No certificate can beat it. Unpinned, one gateway model id was served by
          three different hosts in a single run, so a certificate issued against that id can silently expire. Owned weights on River make the floor stationary
          (one fixed checkpoint), not automatically lower: DeepSeek on River has the same 3.0% floor as the pinned provider.
        </p>
      </Section>

      <Drilldown onClose={() => setDrill(null)} stratum={drill} to={change.to} />
    </div>
  );
}
