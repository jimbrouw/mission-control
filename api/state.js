/*
  Work OS sync endpoint.
  GET  /api/state  -> { state: {...} | null }
  PUT  /api/state  -> { ok: true }
  Auth: Authorization: Bearer <MC_SECRET>

  Requires env vars (set automatically by the Upstash Redis
  integration from the Vercel Marketplace):
    KV_REST_API_URL / KV_REST_API_TOKEN
    (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
  Plus one you set yourself:
    MC_SECRET  -> your passphrase
*/

const REDIS_KEY = "vibe:mc:state";

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const secret = process.env.MC_SECRET;

  if (!url || !token) {
    res.status(500).json({ error: "redis_not_configured" });
    return;
  }
  if (!secret) {
    res.status(500).json({ error: "mc_secret_not_set" });
    return;
  }

  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (supplied !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    if (req.method === "GET") {
      const r = await fetch(url + "/get/" + REDIS_KEY, {
        headers: { Authorization: "Bearer " + token },
      });
      const j = await r.json();
      let state = null;
      if (j && j.result) {
        try { state = JSON.parse(j.result); } catch (e) { state = null; }
      }
      res.status(200).json({ state });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!body || typeof body !== "object") {
        res.status(400).json({ error: "bad_body" });
        return;
      }
      const r = await fetch(url + "/set/" + REDIS_KEY, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      res.status(200).json({ ok: j && j.result === "OK" });
      return;
    }

    res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
}
