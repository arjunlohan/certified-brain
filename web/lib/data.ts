import { readFileSync } from "node:fs";
import path from "node:path";

// Recorded results from the certified-brain pipeline (../ui/data), read at request time.
const dir = path.join(process.cwd(), "../ui/data");
export const readData = <T = any>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8"));

export type Look = { n: number; flips: number; upperBound: number };
export type Stratum = { id: string; size: number; sampled: number; certified: boolean; reused: number; looks: Look[]; trueFlipRate: number; reusedWrong: number };
export type Config = {
  edit: string;
  kind: string;
  stratifier: string;
  alpha: number;
  once: { cells: number; populationFlipRate: number; oracleCalls: number; reused: number; recomputed: number; presentedError: number; strata: Stratum[] };
  rep: { runs: number; certRate: number; savingsMean: number; savingsP05: number; savingsP95: number; oracleMean: number; presentedErrMax: number; exceedances: number };
  costPerCall: number;
  latencyMs: number;
};
export type Floor = { mode: string; model: string; cells: number; selfFlip: number; hosts: { provider: string; n: number }[] };
