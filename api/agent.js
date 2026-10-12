/*
  Work OS agent API.

  GET  /api/agent                   -> a safe workspace summary
  POST /api/agent { action, ... }   -> apply approved new tasks or create one mission

  Auth: Authorization: Bearer <MC_SECRET>
  This endpoint deliberately has no generic state-replacement operation.
*/

import {
  createMissionInState,
  missionSummary,
} from "../shared/missions.js";

const REDIS_KEY = "vibe:mc:state";
const MAX_ITEMS = 60;

function taskId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "agent_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function missionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "agent_mission_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function taskSummary(task) {
  return {
    id: String(task.id || ""), text: String(task.text || ""), note: String(task.note || ""),
    today: Boolean(task.today), when: String(task.when || ""), whenAt: String(task.whenAt || ""), deadline: String(task.deadline || ""),
  };
}

function workspaceSummary(state) {
  const open = (tasks) => (Array.isArray(tasks) ? tasks : []).filter((task) => !task.done).map(taskSummary);
  return {
    updatedAt: Number(state.meta && state.meta.updatedAt) || 0,
    inbox: open(state.inbox),
    missions: (Array.isArray(state.missions) ? state.missions : []).map((mission) => ({
      id: String(mission.id || ""), name: String(mission.name || ""), note: String(mission.note || ""),
      status: String(mission.status || ""), tasks: open(mission.tasks),
    })),
  };
}

async function redisGet(url, token) {
  const response = await fetch(url + "/get/" + REDIS_KEY, { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("redis_get_failed");
  const payload = await response.json();
  if (!payload || !payload.result) return null;
  try { return JSON.parse(payload.result); } catch (error) { throw new Error("stored_state_invalid"); }
}

async function redisSet(url, token, state) {
  const response = await fetch(url + "/set/" + REDIS_KEY, {
    method: "POST", headers: { Authorization: "Bearer " + token }, body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error("redis_set_failed");
  const payload = await response.json();
  if (!payload || payload.result !== "OK") throw new Error("redis_set_failed");
}

function parseItems(body, state) {
  if (!body || body.action !== "apply_items" || !Array.isArray(body.items) || !body.items.length) return { error: "bad_body" };
  if (!Number.isFinite(body.expectedUpdatedAt)) return { error: "missing_state_version" };
  if (body.expectedUpdatedAt !== (Number(state.meta && state.meta.updatedAt) || 0)) return { error: "state_changed" };
  if (body.items.length > MAX_ITEMS) return { error: "too_many_items" };
  const missionIds = new Set((Array.isArray(state.missions) ? state.missions : []).map((mission) => mission.id));
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item.text !== "string" || !item.text.trim()) return { error: "invalid_item" };
    const missionId = item.missionId == null || item.missionId === "" ? null : String(item.missionId);
    if (missionId && !missionIds.has(missionId)) return { error: "unknown_mission" };
    items.push({
      text: item.text.trim().slice(0, 200),
      note: typeof item.note === "string" ? item.note.trim().slice(0, 500) : "",
      missionId,
    });
  }
  return { items };
}

function parseCreateMission(body, state) {
  if (!body || body.action !== "create_mission") return { error: "bad_body" };
  if (body.approved !== true) {
    return { error: "approval_required", message: "Explicit approval of this exact mission is required." };
  }
  if (!Number.isInteger(body.expectedUpdatedAt) || body.expectedUpdatedAt < 0) {
    return { error: "missing_state_version", message: "expectedUpdatedAt must be a non-negative integer from a workspace read." };
  }
  return { input: body };
}

function errorStatus(code) {
  if (code === "state_changed") return 409;
  if (code === "duplicate_mission") return 409;
  if (code === "persistence_verification_failed") return 500;
  if (code === "approval_required") return 403;
  return 400;
}

export default async function handler(req, res) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const secret = process.env.MC_SECRET;
  if (!url || !token) return res.status(500).json({ error: "redis_not_configured" });
  if (!secret) return res.status(500).json({ error: "mc_secret_not_set" });
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (supplied !== secret) return res.status(401).json({ error: "unauthorized" });

  try {
    const state = await redisGet(url, token);
    if (!state || typeof state !== "object") return res.status(404).json({ error: "state_not_found" });
    if (req.method === "GET") return res.status(200).json({ workspace: workspaceSummary(state) });
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (error) { body = null; }
    }
    const parsed = body && body.action === "create_mission"
      ? parseCreateMission(body, state)
      : parseItems(body, state);
    if (parsed.error) {
      return res.status(errorStatus(parsed.error)).json({ error: parsed.error, ...(parsed.message ? { message: parsed.message } : {}) });
    }

    if (body.action === "create_mission") {
      const created = createMissionInState(state, parsed.input, {
        expectedUpdatedAt: parsed.input.expectedUpdatedAt,
        idFactory: missionId,
      });
      if (created.error) {
        return res.status(errorStatus(created.error)).json({
          error: created.error,
          message: created.message,
          ...(created.duplicate ? { duplicate: created.duplicate } : {}),
          ...(created.workspaceUpdatedAt !== undefined ? { workspaceUpdatedAt: created.workspaceUpdatedAt } : {}),
        });
      }

      await redisSet(url, token, state);
      const persistedState = await redisGet(url, token);
      const persistedMission = persistedState && Array.isArray(persistedState.missions)
        ? persistedState.missions.find((mission) => mission.id === created.mission.id)
        : null;
      if (!persistedMission) {
        return res.status(500).json({
          error: "persistence_verification_failed",
          message: "The mission write completed without a verified read-back. Re-read Work OS before retrying.",
        });
      }

      const persisted = missionSummary(persistedMission);
      if (persisted.name !== created.mission.name || persisted.note !== created.mission.note || persisted.status !== created.mission.status) {
        return res.status(500).json({
          error: "persistence_verification_failed",
          message: "The mission read-back did not match the requested mission. Re-read Work OS before retrying.",
        });
      }
      return res.status(200).json({
        mission: persisted,
        workspaceUpdatedAt: Number(persistedState.meta && persistedState.meta.updatedAt) || created.workspaceUpdatedAt,
      });
    }

    if (!Array.isArray(state.inbox)) state.inbox = [];
    if (!Array.isArray(state.missions)) state.missions = [];
    if (!state.meta || typeof state.meta !== "object") state.meta = {};
    if (typeof state.orderSeq !== "number") state.orderSeq = 0;

    const created = [];
    for (const item of parsed.items) {
      state.orderSeq += 10;
      const task = {
        id: taskId(), text: item.text, note: item.note, done: false, doneAt: "",
        today: false, when: "", whenAt: "", deadline: "", checklist: [], order: state.orderSeq,
      };
      if (item.missionId) {
        const mission = state.missions.find((candidate) => candidate.id === item.missionId);
        if (!Array.isArray(mission.tasks)) mission.tasks = [];
        mission.tasks.push(task);
        created.push({ id: task.id, text: task.text, missionId: mission.id, destination: mission.name });
      } else {
        state.inbox.push(task);
        created.push({ id: task.id, text: task.text, missionId: null, destination: "Inbox" });
      }
    }
    state.meta.updatedAt = Date.now();
    await redisSet(url, token, state);
    return res.status(200).json({ ok: true, created });
  } catch (error) {
    return res.status(500).json({ error: "server_error" });
  }
}
