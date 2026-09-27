// Minimal MCP server (Streamable HTTP, JSON responses) so a QM agent can drive the brain:
// start an infographic run (spec, render, fact-check, fix loop), poll it, and ask the brain
// under the three cache policies. Guarded by a bearer token (MCP_TOKEN).
import { ask, EDITS } from "./ask.ts";
import { generate, type Writer } from "./generate.ts";

type Job = { status: "running" | "done" | "error"; started: number; result?: unknown; error?: string };
const jobs = new Map<string, Job>();

const TOOLS = [
  {
    name: "make_infographic",
    description:
      "Start an infographic run on the YC demo studio: a spec writer plans the graphic, Hy Image 3.5 renders it, a blind fact-check reviews every label, and fix passes repair it (2 to 4 minutes). Returns a job id; poll infographic_status. Give either `entity` (a company in the brain, e.g. customers/acme-logistics) or `brief` (pasted data).",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", description: "Brain entity slug, e.g. customers/acme-logistics" },
        brief: { type: "string", description: "Pasted data or a request with the numbers in it" },
        writer: { type: "string", enum: ["river", "muse"], description: "river = our trained model (default), muse = Muse Spark on the gateway" },
      },
    },
  },
  {
    name: "infographic_status",
    description: "Status of a make_infographic job. When done: before/after image URLs, fact-check results per pass, and the remaining defects.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "ask_brain",
    description:
      "Ask the company brain a question after its AI judge changed, answered three ways: stock (re-judge everything), reuse everything (stale answers possible), certified (reuse only what a sampled statistical check proves). Returns each answer with judge calls, cost and wrong verdicts.",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string" },
        question: { type: "string" },
        change: { type: "string", enum: Object.keys(EDITS), description: "3-sem = rule change, 2-fmt = reworded only, swap-9b = our trained judge" },
      },
      required: ["entity", "question"],
    },
  },
];

async function call(name: string, args: any): Promise<unknown> {
  if (name === "make_infographic") {
    const id = crypto.randomUUID().slice(0, 8);
    const job: Job = { status: "running", started: Date.now() };
    jobs.set(id, job);
    generate({ entity: args.entity, brief: args.brief, writer: (args.writer as Writer) ?? "river" })
      .then((r) => Object.assign(job, { status: "done", result: r }))
      .catch((e) => Object.assign(job, { status: "error", error: (e as Error).message }));
    return { job_id: id, status: "running", poll: "infographic_status", eta_seconds: 180 };
  }
  if (name === "infographic_status") {
    const job = jobs.get(args.job_id);
    if (!job) throw new Error(`unknown job ${args.job_id}`);
    return { ...job, elapsed_seconds: Math.round((Date.now() - job.started) / 1000) };
  }
  if (name === "ask_brain") {
    const r: any = await ask(args.entity, args.question, args.change ?? "3-sem", 0.1);
    return {
      entity: args.entity,
      results: r.results.map((x: any) => ({ policy: x.name, answer: x.answer, judge_calls: x.calls, cost_usd: x.costUsd, wrong_verdicts: x.staleCount })),
    };
  }
  throw new Error(`unknown tool ${name}`);
}

export async function handleMcp(req: Request): Promise<Response> {
  const token = process.env.MCP_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return new Response("unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const msg = (await req.json()) as { id?: number | string; method: string; params?: any };
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: msg.id, result });
  if (msg.id === undefined) return new Response(null, { status: 202 }); // notifications
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "yc-demo-brain", version: "0.1.0" } });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        const out = await call(msg.params.name, msg.params.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(out) }] });
      } catch (e) {
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    default:
      return Response.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `unknown method ${msg.method}` } });
  }
}
