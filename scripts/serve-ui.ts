// Ledger UI and Brain Chat at http://localhost:4173 (/ and /chat.html)
import { ask, EDITS, entities } from "../src/ask.ts";

const root = new URL("../ui/", import.meta.url).pathname;
Bun.serve({
  port: Number(process.env.PORT ?? 4173),
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/entities") return Response.json({ entities: entities(), edits: EDITS });
    if (url.pathname === "/api/ask" && req.method === "POST") {
      const b = (await req.json()) as { entity: string; question: string; edit?: string; alpha?: number };
      try {
        return Response.json(await ask(b.entity, b.question, b.edit, b.alpha));
      } catch (e) {
        return Response.json({ error: (e as Error).message }, { status: 500 });
      }
    }
    const file = Bun.file(root + (url.pathname === "/" ? "index.html" : url.pathname.slice(1)));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
console.log("ledger UI on http://localhost:4173 · Brain Chat on http://localhost:4173/chat.html");
