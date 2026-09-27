// Certified reuse of cached verdicts across a definition edit V -> V'
// (prompt version and/or judge model), using the unmodified sIVM certifier.
//
// Oracle calls are counted per sampled cell. Ground-truth labels for V' are
// precomputed for every cell so realized error can be audited and sampling
// replications cost nothing, the same protocol as the preprint (frozen labels).
import { adaptiveCertifyStratum, assignStrataWith, seededShuffle, type SivmCellInput } from "../vendor/sivm.ts";
import { db } from "./store.ts";

export interface Side { version: string; model: string }
export interface CertifyOpts {
  from: Side;
  to: Side;
  alpha: number;
  delta: number;
  estimand: "presented" | "reuse-set";
  stratifier: "value" | "value+confidence";
  seed: number;
  n0?: number;
  maxLooks?: number;
}

interface Cell { pairId: string; cached: string; confidence: number | null; truth: string }

export function loadCells(from: Side, to: Side): Cell[] {
  return db
    .query(
      `SELECT a.pair_id AS pairId, a.verdict AS cached, a.confidence AS confidence, b.verdict AS truth
       FROM verdicts a JOIN verdicts b ON b.pair_id = a.pair_id
       WHERE a.prompt_version=? AND a.model=? AND a.draw=0
         AND b.prompt_version=? AND b.model=? AND b.draw=0
         AND a.verdict != 'error'
       ORDER BY a.pair_id`,
    )
    .all(from.version, from.model, to.version, to.model) as Cell[];
}

const confBucket = (c: number | null) => (c == null ? "c=?" : c >= 0.9 ? "c>=0.9" : c >= 0.7 ? "c=0.7-0.9" : "c<0.7");

export interface StratumReport {
  id: string; size: number; sampled: number; certified: boolean; reused: number;
  looks: { n: number; flips: number; upperBound: number }[];
  trueFlipRate: number; reusedWrong: number;
}

export interface CertifyReport {
  opts: CertifyOpts; cells: number; populationFlipRate: number;
  oracleCalls: number; reused: number; recomputed: number; savings: number;
  presentedError: number; reuseSetError: number; strata: StratumReport[];
  /** Cells served from the old cache under the certificate (not serialized into reports). */
  reusedIds?: string[];
}

export async function certifyOnce(cells: Cell[], o: CertifyOpts): Promise<CertifyReport> {
  const byId = new Map(cells.map((c) => [c.pairId, c]));
  const inputs: SivmCellInput[] = cells.map((c) => ({ rowId: c.pairId, cachedValue: c.cached, boundText: "" }));
  const strata = assignStrataWith(inputs, (c) =>
    o.stratifier === "value" ? "all" : confBucket(byId.get(c.rowId)!.confidence),
  );
  const perStratumDelta = o.delta / Math.max(1, strata.length);
  const out: StratumReport[] = [];
  const reusedIds: string[] = [];
  for (const [si, s] of strata.entries()) {
    const order = seededShuffle(s.rowIds, o.seed * 1000 + si);
    const flip = (id: string) => (byId.get(id)!.truth === byId.get(id)!.cached ? 0 : 1);
    const res = await adaptiveCertifyStratum(
      s.rowIds.length, o.alpha, perStratumDelta,
      async (n) => order.slice(0, n).map(flip),
      o.n0 ?? 45, o.maxLooks ?? 6, o.estimand,
    );
    const unsampled = order.slice(res.sampled);
    const reused = res.certified ? unsampled.length : 0;
    if (res.certified) reusedIds.push(...unsampled);
    out.push({
      id: s.id, size: s.rowIds.length, sampled: res.sampled, certified: res.certified, reused,
      looks: res.looks.map((l) => ({ n: l.n, flips: l.flips, upperBound: l.upperBound })),
      trueFlipRate: s.rowIds.reduce((a, id) => a + flip(id), 0) / s.rowIds.length,
      reusedWrong: res.certified ? unsampled.reduce((a, id) => a + flip(id), 0) : 0,
    });
  }
  const total = cells.length;
  const reused = out.reduce((a, s) => a + s.reused, 0);
  const oracleCalls = out.reduce((a, s) => a + s.sampled, 0);
  const wrong = out.reduce((a, s) => a + s.reusedWrong, 0);
  return {
    opts: o, cells: total,
    populationFlipRate: cells.filter((c) => c.truth !== c.cached).length / total,
    oracleCalls, reused, recomputed: total - reused - oracleCalls, savings: reused / total,
    presentedError: wrong / total, reuseSetError: reused ? wrong / reused : 0, strata: out, reusedIds,
  };
}

export interface Replication {
  runs: number; certRate: number; savingsMean: number; savingsP05: number; savingsP95: number;
  oracleMean: number; presentedErrMax: number; exceedances: number;
}

/** Re-run the certifier over R seeds on frozen labels: the guarantee's empirical check. */
export async function replicate(cells: Cell[], o: CertifyOpts, runs = 1000): Promise<Replication> {
  const sav: number[] = [];
  let certified = 0, oracle = 0, errMax = 0, exceed = 0;
  for (let r = 0; r < runs; r++) {
    const rep = await certifyOnce(cells, { ...o, seed: 10_000 + r });
    sav.push(rep.savings);
    oracle += rep.oracleCalls;
    if (rep.reused > 0) certified++;
    // Guarantee: every certified stratum's true flip rate <= alpha (w.p. 1-delta).
    if (rep.strata.some((s) => s.certified && s.trueFlipRate > o.alpha)) exceed++;
    errMax = Math.max(errMax, rep.presentedError);
  }
  sav.sort((a, b) => a - b);
  return {
    runs, certRate: certified / runs,
    savingsMean: sav.reduce((a, b) => a + b, 0) / runs,
    savingsP05: sav[Math.floor(runs * 0.05)]!, savingsP95: sav[Math.floor(runs * 0.95)]!,
    oracleMean: oracle / runs, presentedErrMax: errMax, exceedances: exceed,
  };
}
