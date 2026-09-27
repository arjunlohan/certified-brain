// QM discovers gateway models through GET /v1/models plus LiteLLM's GET /model_group/info.
// The Vercel AI Gateway only has the first, so this shim adds the metadata for Muse Spark 1.3
// and forwards every other request (inference included) to the gateway unchanged.
const UPSTREAM = "https://ai-gateway.vercel.sh";
const GROUPS = [
  {
    model_group: "meta/muse-spark-1.3-contributor",
    mode: "chat",
    providers: ["meta"],
    supports_function_calling: true,
    supports_vision: true,
    max_input_tokens: 1_000_000,
    max_output_tokens: 64_000,
    input_cost_per_token: 0.1e-6, // $0.10 per million, from the gateway's model card
    output_cost_per_token: 0.2e-6,
  },
];

Bun.serve({
  port: 4175,
  idleTimeout: 240,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/model_group/info") return Response.json({ data: GROUPS });
    // Advertise only the models this demo offers (QM rejects the whole catalog on one odd id).
    if (url.pathname === "/v1/models") return Response.json({ object: "list", data: GROUPS.map((g) => ({ id: g.model_group, object: "model", owned_by: "meta" })) });
    const headers = new Headers(req.headers);
    headers.delete("host");
    // QM sends the key in x-api-key; the gateway's OpenAI routes want a bearer token.
    const key = headers.get("x-api-key");
    if (key && !headers.get("authorization")) headers.set("authorization", `Bearer ${key}`);
    const body = req.method === "POST" ? await req.text() : undefined;
    if (body) console.log(req.method, url.pathname, body.match(/"model"\s*:\s*"([^"]+)"/)?.[1] ?? "");
    return fetch(UPSTREAM + url.pathname + url.search, { method: req.method, headers, body });
  },
});
console.log("gateway shim on :4175");
