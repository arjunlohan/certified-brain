// Serve the ledger UI at http://localhost:4173
const root = new URL("../ui/", import.meta.url).pathname;
Bun.serve({
  port: Number(process.env.PORT ?? 4173),
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(root + (path === "/" ? "index.html" : path.slice(1)));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
console.log("ledger UI on http://localhost:4173");
