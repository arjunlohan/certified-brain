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

### Judge swap: owning the judge (River)

Same GBrain prompt, judge model swapped. Cells are 2,000 held-out pairs, disjoint from the 1,500 used for training. α = 0.1, 1,000 replications.

| New judge | Agreement with teacher | Cells that changed | Certified reuse | Judge calls | Realized error | Self-flip floor |
|---|---|---|---|---|---|---|
| Qwen3.5-9B, untrained | 78.8% (n = 500) | 21.2% | 0% (all refused) | 135 / 500 | n/a | not measured |
| **Qwen3.5-9B, LoRA SFT on River** | **87.0%** | 13.0% | **63.9%** | **505 / 2,000** | **0.70%** | **0.33%** |
| DeepSeek-V4-Flash (teacher's model) on River | 96.2% | 3.9% | 63.9% | 550 / 2,000 | 1.05% | 3.0% |
| DeepSeek-V4-Flash, LoRA SFT on River (30 steps) | 90.3% | 9.7% | 0% on seed 1; 35.4% mean over replications | 190 / 2,000 | n/a | not measured |

- Fine-tuning DeepSeek-V4-Flash on the teacher's verdicts (rank 32, lr 1e-4, 30 steps; the loss never fell) made it worse: 96.2% to 90.3% agreement, with temporal_evolution falling from 84.5% to 50.7%. The certifier refused the promotion at α = 0.1, which is the intended behavior: certification doubles as a regression gate for judge swaps.
- Training: rank-32 LoRA, 60 steps, batch 16, lr 2e-4, mean-normalized cross-entropy, thinking off. Loss 0.065 to about 0.003.
- The trained 9B matches the teacher on `no_contradiction` (98.9%) but collapses on the rare temporal classes (29 to 34%); the certifier refuses exactly those strata.
- The provider floor (3.0% pinned) equals the floor of the same model on River (3.0%), so the provider's residual is model nondeterminism, not host swaps alone. The trained 9B's floor is 0.33%.

## The demo app (localhost)

A Next.js app in `web/` (shadcn components and the design system of the infographic studio) is the demo. It reads the recorded results in `ui/data/` and proxies live calls to the Bun API.

```bash
bun run ui                          # API + legacy ledger on :4173 (bun:sqlite, River)
cd web && pnpm install && pnpm dev  # the demo on http://localhost:3000
```

- `/` Certified reuse: the paper, a three-lane replay (reuse everything, stock GBrain, certified) of a recorded certification on a shared judge-call clock, the kept or re-checked groups with a drill-down into real flipped pairs, and the judge swaps to models trained on River.
- `/ask` Ask the brain A/B: one question answered under the three cache policies, with showcase queries found by `scripts/find-showcase.ts`.
- `/infographic` Infographics A/B: Muse Spark vs our River-trained spec writer, both prompted with the infographic studio's planner instructions and run through the studio's own quality loop (render, blind fact-check, fix by edit or re-render). Before is the first render, after is what the loop ships. `scripts/samples.ts` precomputes the samples; QA runs are logged to the studio's store so its learned render policy improves.

`DEMO.md` is the script for the demo video.

## Brain Chat: stock vs reuse-all vs certified

In the app at `/ask` (or the legacy page `/chat.html` on :4173). Pick an entity and a change (semantic prompt edit, formatting edit, or judge swap to the River 9B) and ask a question. The brain answers three ways, each written by DeepSeek-V4-Flash on River from the verdicts that policy serves:

- **Stock GBrain:** the cache key includes prompt_version and model, so every verdict is re-judged. Correct, full cost. This is GBrain's intended behavior, not a bug.
- **Reuse all:** the obvious "fix", dropping the version from the key. Free, and silently wrong: after the semantic edit it serves 576 stale verdicts of 4,863.
- **Certified:** 1,267 judge calls instead of 4,863 ($0.16 vs $0.63), 48 stale verdicts, bounded by α = 0.1.

## Owning the infographic studio's spec writer

Qwen3.5-9B, LoRA-trained on River (40 steps, batch 8) on 89 specs written by Muse Spark 1.3, the studio's spec model. On 19 held-out prompts from 10 unseen entities: 19/19 valid specs (untrained 9B: 16/19), 100% of printed numbers found in the notes, 52% label overlap with the teacher (untrained: 38%). One held-out render (Acme Logistics) fact-checked by the studio's reviewer: River 9B spec 8/10 with 0 of 14 strings wrong; Muse Spark spec 4/10 with 2 of 15 wrong (single render, not a benchmark).

## From brain to infographic (infographic studio + Hy Image 3.5)

`scripts/infographic.ts` turns one GBrain entity into a before/after infographic using the [infographic studio](https://github.com/arjunlohan/gmi-hackathon-infographic-agent)'s spec compiler and GMI client, imported from the sibling repo:

1. DeepSeek-V4-Flash **on River** writes an infographic spec from the notes the brain held before the correcting notes arrived (Continental Retail Group before 2025-12-01).
2. It then updates that spec with all notes plus the 15 cached judge verdicts for this entity (supersessions, contradictions). The diff is the edit: 6 values, the headline and 2 callouts.
3. Hy Image 3.5 preview renders **before** (text-to-image), **after as an image-to-image edit** of before (only the changed labels), and **after as a full re-render**.
4. The studio's vision reviewer fact-checks each render against its spec's text contract (`scripts/review-infographic.ts`).

| Render | Wrong or missing (of 19 required strings) | Stale text left over |
|---|---|---|
| Before, text-to-image | 1 | none |
| After, image-to-image edit | 4 | "$1.2M", "5", "Pilot not renewed as originally planned." |
| After, full re-render | 1 | none |

The image edit is the cheap way to reuse, and it kept three stale facts from before the correction. Reuse without verification leaks stale facts, whether the thing reused is a verdict cache or a picture. Renders and specs are stored in Neon (`certified_brain.infographics`).

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
