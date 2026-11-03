// Dialed In sync server. Stores one encrypted blob per sync group and hands it back.
// It never sees the sync code, the encryption key or any readable student data.
//
//   GET    /v1/sync/:id                      -> 200 { version, data, updatedAt } | 404
//   GET    /v1/sync/:id?meta=1               -> 200 { version } | 404
//   PUT    /v1/sync/:id  { data, ifVersion } -> 200 { version } | 409 { version } (someone else wrote first)
//   DELETE /v1/sync/:id                      -> 204
const MAX_BYTES = 1_500_000;
const ID_RE = /^[0-9a-f]{64}$/;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (body, status, headers) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default {
  async fetch(req, env) {
    const h = cors(req.headers.get("Origin") || "", env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const path = new URL(req.url).pathname;
    // A friendly status page, so opening the address in a browser doesn't look broken.
    if (path === "/" && req.method === "GET") {
      return new Response("✅ Dialed In sync server is running.\n\nThis address is used by the app (imdialedin.app) to sync encrypted study data between devices. There's nothing to see here.\n", {
        status: 200, headers: { ...h, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const m = path.match(/^\/v1\/sync\/([^/]+)$/);
    if (!m) return json({ error: "not found" }, 404, h);
    const id = m[1];
    if (!ID_RE.test(id)) return json({ error: "bad id" }, 400, h);

    if (req.method === "GET") {
      // ?meta=1: just the version, so devices can check for changes without downloading everything.
      if (new URL(req.url).searchParams.has("meta")) {
        const v = await env.DB.prepare("SELECT version FROM blobs WHERE id = ?").bind(id).first();
        return v ? json({ version: v.version }, 200, h) : json({ error: "no sync" }, 404, h);
      }
      const row = await env.DB.prepare("SELECT version, data, updated_at FROM blobs WHERE id = ?").bind(id).first();
      return row ? json({ version: row.version, data: row.data, updatedAt: row.updated_at }, 200, h) : json({ error: "no sync" }, 404, h);
    }

    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: "too large" }, 413, h);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: "bad json" }, 400, h); }
      const { data, ifVersion } = body || {};
      if (typeof data !== "string" || !Number.isInteger(ifVersion) || ifVersion < 0) return json({ error: "bad body" }, 400, h);
      const now = Date.now();
      // Only write if nobody else wrote since this device last looked (optimistic concurrency).
      const res = ifVersion === 0
        ? await env.DB.prepare("INSERT INTO blobs (id, version, data, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, data, now).run()
        : await env.DB.prepare("UPDATE blobs SET data = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(data, now, id, ifVersion).run();
      if (res.meta.changes === 1) return json({ version: ifVersion + 1 }, 200, h);
      const cur = await env.DB.prepare("SELECT version FROM blobs WHERE id = ?").bind(id).first();
      return json({ error: "conflict", version: cur ? cur.version : 0 }, 409, h);
    }

    if (req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM blobs WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204, headers: h });
    }
    return json({ error: "method not allowed" }, 405, h);
  },
};
