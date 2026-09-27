# Demo video script (about 3 minutes)

Run it locally: `bun run ui` (API on :4173), then `cd web && pnpm install && pnpm dev`, and open http://localhost:3000.
Record at a wide window (1440 px or more) so the three lanes sit side by side.

## 0:00 · How it works (20 s)

Open `/`. Read the headline and point at the four numbers for the semantic prompt change:
73.9% of 4,863 cached verdicts reused with a certificate, 1,267 judge calls instead of 4,863, 48 stale verdicts served instead of 576, 0 of 1,000 replications over budget.

> Every agent memory caches LLM judgments. Change the prompt or the model and you either throw them all away or keep them blindly. We keep exactly what we can prove.

## 0:20 · The problem, in one picture (20 s)

Open `/infographic`. Optionally click a sample prompt first: both writers generate live (about 60 s), the same compiler, Hy Image render and fact-check. Then scroll to the recorded Continental Retail result. Point at the middle image: editing the old infographic in place (image-to-image) kept "$1.2M", "5" and "Pilot not renewed", facts the brain had already corrected. The full re-render has none of them.

> Reuse without checking leaks stale facts. That is true for pixels, and it is true for a memory's cached verdicts.

## 0:40 · The race (60 s)

Open `/reuse`. "Rule change", budget 10%, press Play.

- Left lane, reuse everything: instant, free, and 576 red squares: stale verdicts served.
- Middle lane, stock GBrain: re-judges all 4,863, the call counter climbs.
- Right lane, certified: yellow samples first; when the big no_contradiction group's bound clears α, 3,596 squares turn green at once; the temporal groups are refused and re-judged. Done at 1,267 calls, 48 stale (0.99%, inside the 10% budget).

Scroll to the certificate table. Click the `temporal_evolution` row and read one flipped pair: two notes, the cached verdict, the new verdict.

## 1:40 · Guess which edit is safer (30 s)

Section 03. Ask the room: "Formatting only" or "Rule change"? Click Formatting only.

> The harmless-looking edit flipped 4.6% of the biggest group. The rule change flipped 1.4%. You cannot eyeball which edit is safe; you have to measure it.

## 2:10 · Own the judge (40 s)

Section 04, or pick "9B, untrained" then "Our 9B, trained" in the replay.

- Untrained 9B: every group refused, 0% reuse.
- Trained on River on 1,500 of the teacher's verdicts: 87% agreement, 505 judge calls, 0.70% realized error.
- DeepSeek V4 Flash fine-tuned on River got worse; the certifier handed it far less (nothing on this seed, 35.4% on average).
- Compare judges on calls and error. Equal reuse percentages come from reuse moving in whole-group steps, not from the judges being equally good.
- The floor tiles: one gateway model id was served by three hosts in one run. Owned weights keep the floor stationary, so a certificate does not silently expire. They do not make it lower by themselves: DeepSeek on River has the same 3.0% floor as the provider.

## 2:50 · Close (10 s)

`/ask` if time allows: click a starter, three answers side by side. Then the sidebar links: certified-brain, the GBrain fork (contradiction probe in the nightly dream cycle, #5559) and the QM fork (external memory providers were never consulted, #1452).

## Do not claim

- A live stopwatch race. The replay is recorded data on a shared judge-call clock.
- That owned weights lower the floor.
- That QM runs live. It is unblocked by the fork fix, not wired. Fact-check results are in gbrain.io under northwind/qa/ (written from the recorded runs, not automatically by the app).
