// Runs the infographic studio's own render loop (render, blind fact-check, fix by edit or
// re-render, up to six passes) on one spec, then logs the QA run to the studio's store so its
// learned render policy improves. Run with cwd = the studio checkout so its .env.local loads.
// stdin: {"spec": InfographicSpec, "sessionId": string}; stdout: the final RenderResult (JSON).
const STUDIO = `${process.env.HOME}/Downloads/GitHub/gmi-hackathon-infographic-agent/.claude/worktrees/infographic-generator-eve-spark-0d911d/agent/lib`;
const { prepareStep } = await import(`${STUDIO}/steps.ts`);
const { qualityLoop } = await import(`${STUDIO}/render.ts`);
const { saveQaRun } = await import(`${STUDIO}/db.ts`);

const { spec, sessionId } = JSON.parse(await Bun.stdin.text());
const prepared = await prepareStep(spec);
if ("error" in prepared) throw new Error(prepared.error);
const { prompt, ...compiled } = prepared.compiled;
const qaId = `${sessionId}:${Date.now()}`;
let last: any;
for await (const snap of qualityLoop({ ...compiled, basePrompt: prompt, policy: prepared.policy, sessionId, qaId })) {
  last = snap;
  console.error(`pass ${snap.pass} ${snap.phase} ${snap.note ?? ""}`);
}
try {
  await saveQaRun({ qaId, sessionId, tool: "generate_infographic", meta: last.meta, verdict: last.review?.verdict, checks: last.review?.checks, passes: last.passes ?? [], output: last });
} catch (e) {
  console.error("qa log failed", (e as Error).message);
}
process.stdout.write(JSON.stringify(last));
