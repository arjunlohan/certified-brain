# Demo script (3 minutes)

**Open on:** the ledger UI (`bun run ui`, http://localhost:4173), "Semantic prompt edit", α = 0.1.

## 0:00 · The problem (30 s)

> GBrain caches every judge verdict keyed on the prompt version and model. The schema comment says the key exists "so any prompt edit cleanly invalidates prior verdicts." So every judge-prompt release, and every model swap, throws the whole cache away and re-judges the brain. The only alternative today is reusing stale verdicts with no bound on how wrong they are.

## 0:30 · The certificate (60 s)

Point at the KPI row and the strata table.

> This is GBrain's own contradiction judge, imported from the repo, over 4,863 cached verdicts on a company brain. We shipped a semantic rule change. Instead of re-judging all 4,863, we froze the cache into strata by cached verdict and sampled each one on a doubling schedule.
>
> **527 new judge calls certified 73.9% of the cache for reuse, at 0.99% realized error, against a 10% budget.** The "no contradiction" stratum certified. The three temporal strata were refused after their first 45 samples, because the new rule flips 56 to 62% of them. The certifier found exactly the slice the edit touched.

Toggle to "Formatting-only prompt edit".

> A formatting-only edit: 66.4% reused for 1,003 calls, 3.1% error.

Scroll to "Does the guarantee hold?"

> Same labels, 1,000 sampling replications per configuration, 12 configurations: zero guarantee violations.

## 1:30 · Refusal is a diagnosis (30 s)

Scroll to "Judge floor".

> Why were the temporal strata refused even on a formatting edit? Ask the judge the same question twice. It disagrees with itself 22 to 26% of the time on temporal_evolution. The "flips" there are the judge's own noise. The refusal is telling you which slice of your brain the judge cannot reproduce.
>
> And look at the hosts column: one model id, served by three different hosts in the same minute. The provider can swap what is behind a model id without telling you, and every certificate you issued silently expires.

## 2:00 · Own the judge (45 s)

Switch to "Swap to owned 9B (trained)".

> So we trained our own judge on River: Qwen3.5-9B, LoRA, on 1,500 of the teacher's verdicts, disjoint from the cells we certify. Then we treated the model swap as one more definition edit.
>
> [read: agreement with the teacher, certified inheritance %, oracle calls, refused strata, and the owned model's floor]
>
> Weights you own do not change host under you, so the certificate does not expire. That is what "own your intelligence" means for a memory: the judge, the cache and the guarantee are all yours.

## 2:45 · Close (15 s)

> Also shipped: the contradiction probe now runs in GBrain's nightly dream cycle (issue #5559), default off, $1 cap, tests passing. Certified Brain makes running it nightly affordable, because most verdicts carry over.

---

**Backup:** the demo reads `ui/data/report.json`, committed; no API calls needed. Record a 2-minute screen capture of the flow above by 4:15.

**If asked about the certifier:** it is the sIVM procedure from my preprint *Reuse, but Verify* (doi:10.5281/zenodo.21833641), vendored unmodified. What is new today: GBrain's verdict caches as the target, the model swap as a definition edit, the owned judge, and the #5559 phase.
