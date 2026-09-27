# Certified Brain

**Every AI memory re-judges everything when the prompt or the model changes. Certified Brain certifies which cached verdicts carry over, per slice, under an error budget, and refuses the rest.**

Built at the YC *Own Your Intelligence* hackathon (Sep 27 2026) on top of [GBrain](https://github.com/garrytan/gbrain).

## The problem

GBrain caches LLM judge verdicts keyed on the prompt version and model:

- `eval_contradictions_cache`: `(chunk_a_hash, chunk_b_hash, model_id, prompt_version, truncation_policy)`, "so any prompt edit cleanly invalidates prior verdicts"
- `take_grade_cache`: `(take_id, prompt_version, judge_model_id, evidence_signature)`

So every judge-prompt release or judge-model swap discards the whole cache and re-judges everything. The alternative, reusing stale verdicts, has no bound on how wrong they are.

## What this does

It runs the sIVM certifier from *Reuse, but Verify: Certified Maintenance of LLM-Computed Table Cells under Prompt Edits* (Lohan 2026, [doi:10.5281/zenodo.21833641](https://doi.org/10.5281/zenodo.21833641)) against GBrain's contradiction judge:

1. **Freeze strata** by cached verdict (optionally × judge confidence) before any new call.
2. **Sample** each stratum on a doubling schedule under the new definition.
3. **Bound** each stratum's flip rate (Maurer-Pontil empirical Bernstein, Bonferroni over strata and looks).
4. **Reuse** only strata whose bound clears the error budget α. Recompute the rest.

With probability ≥ 1 − δ, every certified stratum's true flip rate is ≤ α. A refused stratum is a diagnosis: the slice of the brain the judge cannot reproduce after the change.

The judge prompt, verdict parser and truncation are imported directly from GBrain (`src/core/eval-contradictions/judge.ts`), so every verdict is byte-compatible with GBrain's probe.

## Results

GBrain's contradiction judge over 4.8k cached verdicts on a synthetic company brain. δ = 0.1, presented-cells estimand, strata by cached verdict, 1,000 sampling replications per configuration.

| Edit | Cells that changed | α | Certified reuse | Judge calls to certify | Realized error (presented) | Exceedances |
|---|---|---|---|---|---|---|
| Formatting only | 7.3% | 0.10 | 66.4% | 1,003 / 4,829 | 3.11% | 0 / 1,000 |
| Formatting only | 7.3% | 0.20 | 77.6% | 773 / 4,829 | 3.60% | 0 / 1,000 |
| Semantic | 11.8% | 0.05 | 51.7% | 1,607 / 4,863 | 0.56% | 0 / 1,000 |
| Semantic | 11.8% | 0.10 | 73.9% | 527 / 4,863 | 0.99% | 0 / 1,000 |
| Semantic | 11.8% | 0.20 | 77.6% | 347 / 4,863 | 1.03% | 0 / 1,000 |

- The semantic edit flips 56 to 62% of the three temporal strata. Each is refused after its first 45-sample look; the `no_contradiction` stratum (1.4% flip) certifies.
- **Judge self-flip floor** (same cell, same prompt, T = 0, 300 cells): 3.0% pinned to one host, 3.7% on any host, with `temporal_evolution` at 22 to 26%. The formatting edit's refused strata flip at their own floor: those flips are the judge's noise, not the edit.
- Unpinned, one model id was served by three different hosts within one minute.
- Stratifying further by judge confidence did not add savings, matching the preprint's finding that refinement costs power when within-stratum risk is homogeneous.

## Changes certified

| Edit | What changes |
|---|---|
| `2 → 2-fmt` | Formatting only: rules unwrapped and numbered. Same meaning. |
| `2 → 3-sem` | A semantic rule change of the kind a release ships. |
| model swap | GBrain's prompt, judged by an owned model (Half 2, River). |

## Run it

```bash
# siblings: ../gbrain (the fork) with `bun install` done
echo 'AI_GATEWAY_API_KEY=...' > .env.local
bun run corpus        # synthetic company brain: 60 entities, ~350 dated notes
bun run pairs         # probe-style pairs: 240 queries x top-9 retrieval
bun run judge 2       # fill the cache with GBrain's shipped prompt
bun run judge 2-fmt   # ground truth under each edit (for audit only)
bun run judge 3-sem
bun run certify       # certification grid + 1,000 replications -> ui/data/report.json
bun run floor         # judge self-flip floor (pinned host vs any host)
bun run ui            # ledger at http://localhost:4173
```

## Honest notes

- The corpus is synthetic (generated with DeepSeek V4 Flash), and pair generation emulates GBrain's probe (top-K retrieval, cross-page pairs) with a keyword scorer.
- Ground-truth labels under the new definition are precomputed so realized error can be audited and replications are free; the certifier only "spends" the cells it samples, as in the preprint's protocol.
- Teacher: `deepseek/deepseek-v4-flash-0731` via the Vercel AI Gateway, thinking off, T = 0, pinned to one host. Unpinned, one model id was served by three different hosts in 60 calls.

## License

Project code: MIT. `vendor/sivm.ts` is vendored unmodified from [project-lore](https://github.com/arjunlohan/project-lore) under PolyForm Noncommercial 1.0.0 (see the file header).
