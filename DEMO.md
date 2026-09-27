# Demo video script (about 3 minutes)

Run it locally: `bun run ui` (API on :4173), then `cd web && pnpm install && pnpm dev`, and open http://localhost:3000.
Record at a wide window (1440 px or more) so the three lanes sit side by side.

## 0:00 · Certified reuse, the idea (20 s)

Open `/`. Point at the paper card: why (every prompt or model change forces a memory to re-run every saved judgment or trust stale ones), what (sample each group, keep it only when the bound proves few changed), where (agent memories like GBrain, AI-filled spreadsheet cells, eval caches).

## 0:20 · The race (60 s)

Still on `/`. "Rule change", budget 10%, press Play.

- Reuse everything: instant, free, 576 wrong answers served.
- Stock GBrain: re-asks all 4,863, the call counter climbs.
- Certified: samples first; the big group passes and 3,596 squares turn green at once; the rest are re-checked. Done at 1,267 calls, 48 wrong (inside the 10% budget), 0 breaches in 1,000 reruns.

Click a group in "Kept or re-checked" and read one pair whose answer flipped.

## 1:20 · Guess (20 s)

"Which change breaks more answers?" The formatting-only edit flipped 4.6% of the biggest group, the rule change 1.4%. You can't eyeball it; you measure it.

## 1:40 · Own the judge (20 s)

Tiles at the bottom: our trained model keeps most of the cache; the same model untrained keeps nothing; the big model after our fine-tune got worse and the certificate handed it far less.

## 2:00 · Ask the brain (30 s)

`/ask`, click the Edge Compute starter. Three answers side by side: stock (15 calls), reuse everything (0 calls, 4 wrong), certified (5 calls, 0 wrong).

## 2:30 · Infographics (30 s)

`/infographic`. Click through the samples. For each model: before (first render) and after (what the fix loop ships), with the fact-check score. Same planner instructions, same Hy Image 3.5 render and the studio's own fix loop for both; only the spec writer differs (rented Muse Spark vs our trained model on River).

## Do not claim

- A live stopwatch race. The replay is recorded data on a shared judge-call clock.
- That owned weights lower the judge's self-disagreement floor. They keep it fixed.
- That QM runs live. Its local sandbox needs Docker; QM Loops are the target home for the render, check, fix and remember loop.
