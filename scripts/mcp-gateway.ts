// Public face for the Cloudflare tunnel: forwards only /mcp (token-checked there) to the
// local API, so the rest of the local server stays private.
Bun.serve({
  port: 4174,
  idleTimeout: 240,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/mcp") return new Response("not found", { status: 404 });
    return fetch(`http://localhost:4173/mcp`, { method: req.method, headers: req.headers, body: req.body });
  },
});
console.log("MCP gateway on :4174");
