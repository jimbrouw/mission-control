/*
  Work OS braindump triage endpoint.
  POST /api/triage -> { items: [...] }  or  { error: "..." }
  Auth: Authorization: Bearer <MC_SECRET>   (same passphrase as api/state.js)

  Body: { rawText: string, missions: [{ id, name, status }] }

  Splits rawText into candidate task fragments (line breaks, then
  sentence boundaries within a line), sends them to Gemini along with a
  slim summary of existing missions, and asks it to return cleaned-up
  task proposals as strict JSON. This endpoint never writes to
  Redis/state — it only proposes; the client decides what to merge in.

  Model: gemini-3.5-flash-lite (Google's current lowest-cost Flash-Lite
  tier per ai.google.dev/gemini-api/docs/latest-model — check that page
  again if this endpoint starts 404ing, Google renames these).

  Note on "duplicateOf": this endpoint deliberately does not receive
  the existing task backlog (only id/name/status per mission, to keep
  the prompt small), so the model can only flag near-duplicates
  *within the same pasted braindump* (e.g. the user typed the same
  reminder twice). When set, "duplicateOf" holds the cleaned "text" of
  the other item in this same response it looks like a repeat of — not
  a real task id. Cross-checking against the actual backlog would need
  the request body to include existing task titles too.

  Requires:
    MC_SECRET       -> same passphrase as api/state.js
    GEMINI_API_KEY     -> Gemini API key from ai.google.dev (preferred)
    GEMINI_API_SECRET  -> supported legacy/alternate name
*/

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  GEMINI_MODEL + ":generateContent";

const MAX_CANDIDATES = 60;
const MAX_RAW_LEN = 12000;

function splitCandidates(raw) {
  const lines = String(raw || "")
    .slice(0, MAX_RAW_LEN)
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^[-*••]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .trim();
    if (!cleaned) continue;
    // split multi-sentence lines on sentence boundaries
    const sentences = cleaned
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1);
    if (sentences.length > 1) out.push(...sentences);
    else out.push(cleaned);
  }

  const seen = new Set();
  const deduped = [];
  for (const c of out) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
    if (deduped.length >= MAX_CANDIDATES) break;
  }
  return deduped;
}

function buildPrompt(candidates, missions) {
  const missionsBlock = JSON.stringify(missions);
  const candidatesBlock = candidates.map((c, i) => (i + 1) + ". " + c).join("\n");

  return [
    "You are triaging a raw braindump into clean, actionable to-do items",
    "for a personal task manager. Below is a numbered list of candidate",
    "task fragments already split out of the user's pasted text, and a",
    "list of the user's existing projects (\"missions\").",
    "",
    "Existing missions (JSON array of {id, name, status}):",
    missionsBlock,
    "",
    "Candidate fragments:",
    candidatesBlock,
    "",
    "For each candidate that describes a real actionable task, produce one",
    "item. Skip fragments that are not actionable (stray words, headers,",
    "empty thoughts, greetings). You may merge two adjacent fragments into",
    "one item if they clearly describe a single task split across lines.",
    "Clean up phrasing into a short imperative task title.",
    "",
    "For each item return:",
    "- text: cleaned, short, imperative task title",
    "- note: any extra detail that doesn't belong in the title, else \"\"",
    "- missionId: the id (from the missions list above) this task",
    "  clearly belongs to, else null",
    "- suggestedNewMission: if the task doesn't fit any existing mission",
    "  but clearly implies a new project/theme, a short name for that",
    "  new mission, else null. Never set both missionId and",
    "  suggestedNewMission on the same item.",
    "- duplicateOf: if this item looks like a near-duplicate of another",
    "  item in this same response, the exact \"text\" value of that other",
    "  item, else null",
    "",
    "Respond with ONLY strict JSON, no markdown fences, no prose, no",
    "explanation, matching exactly this shape:",
    '{"items":[{"text":"","note":"","missionId":null,"suggestedNewMission":null,"duplicateOf":null}]}',
  ].join("\n");
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export default async function handler(req, res) {
  const secret = process.env.MC_SECRET;
  if (!secret) {
    res.status(500).json({ error: "mc_secret_not_set" });
    return;
  }

  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (supplied !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKeys = [...new Set([
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_SECRET,
    process.env.GEMINI_API_secret,
  ].filter(Boolean))];
  if (!apiKeys.length) {
    res.status(500).json({ error: "gemini_api_key_not_set" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body.rawText !== "string" || !body.rawText.trim()) {
    res.status(400).json({ error: "bad_body" });
    return;
  }

  const missions = Array.isArray(body.missions)
    ? body.missions
        .map((m) => ({
          id: String((m && m.id) || ""),
          name: String((m && m.name) || ""),
          status: String((m && m.status) || ""),
        }))
        .filter((m) => m.id && m.name)
    : [];

  const candidates = splitCandidates(body.rawText);
  if (!candidates.length) {
    res.status(200).json({ items: [] });
    return;
  }

  const prompt = buildPrompt(candidates, missions);

  try {
    let r = null;
    let authFailed = false;
    for (const apiKey of apiKeys) {
      r = await fetch(GEMINI_URL + "?key=" + encodeURIComponent(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });

      if (r.ok) break;
      const errText = await r.text().catch(() => "");
      authFailed = r.status === 401 || r.status === 403 || /API_KEY_INVALID|API key not valid/i.test(errText);
      if (!authFailed || apiKey === apiKeys[apiKeys.length - 1]) {
        if (r.status === 429) {
          res.status(502).json({ error: "gemini_rate_limited" });
          return;
        }
        res.status(502).json({
          error: authFailed ? "gemini_auth_failed" : "gemini_request_failed",
          detail: authFailed ? undefined : errText.slice(0, 300),
        });
        return;
      }
    }

    const j = await r.json();
    const text =
      j &&
      j.candidates &&
      j.candidates[0] &&
      j.candidates[0].content &&
      j.candidates[0].content.parts &&
      j.candidates[0].content.parts[0] &&
      j.candidates[0].content.parts[0].text;

    if (!text) {
      res.status(502).json({ error: "gemini_empty_response" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      try {
        parsed = JSON.parse(stripFences(text));
      } catch (e2) {
        res.status(502).json({ error: "gemini_malformed_json" });
        return;
      }
    }

    const items = Array.isArray(parsed && parsed.items) ? parsed.items : null;
    if (!items) {
      res.status(502).json({ error: "gemini_malformed_json" });
      return;
    }

    const missionIds = new Set(missions.map((m) => m.id));
    const clean = items
      .filter((it) => it && typeof it.text === "string" && it.text.trim())
      .slice(0, MAX_CANDIDATES)
      .map((it) => {
        const validMission = typeof it.missionId === "string" && missionIds.has(it.missionId);
        return {
          text: it.text.trim().slice(0, 200),
          note: typeof it.note === "string" ? it.note.trim().slice(0, 500) : "",
          missionId: validMission ? it.missionId : null,
          suggestedNewMission:
            !validMission && typeof it.suggestedNewMission === "string" && it.suggestedNewMission.trim()
              ? it.suggestedNewMission.trim().slice(0, 80)
              : null,
          duplicateOf:
            typeof it.duplicateOf === "string" && it.duplicateOf.trim()
              ? it.duplicateOf.trim().slice(0, 200)
              : null,
        };
      });

    res.status(200).json({ items: clean });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
}
