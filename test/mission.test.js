import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createMissionInState,
  DEFAULT_MISSION_STATUS,
  findDuplicateMission,
} from "../shared/missions.js";
import { datePart, defaultWhenAt, timeLabel } from "../shared/date-time.js";
import agentHandler from "../api/agent.js";

function baseState() {
  return {
    meta: { updatedAt: 10 },
    inbox: [{ id: "inbox-1", text: "Keep this", done: false }],
    missions: [{
      id: "existing-1", name: "Existing Mission", note: "Keep this note", status: "LIVE",
      tasks: [{ id: "task-1", text: "Keep this task", done: false }],
    }],
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function mockResponse() {
  let statusCode = 200;
  let payload = null;
  return {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
    result() { return { statusCode, payload }; },
  };
}

async function callAgent(state, body, options = {}) {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
    secret: process.env.MC_SECRET,
  };
  let stored = structuredClone(state);
  let readBack = true;
  let getCount = 0;
  const requests = [];
  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "token";
  process.env.MC_SECRET = "secret";
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.includes("/get/")) {
      getCount += 1;
      if (options.mismatch && getCount > 1) stored.missions.at(-1).name = "Different mission";
      return response(readBack || getCount === 1 ? { result: JSON.stringify(stored) } : { result: null });
    }
    if (url.includes("/set/")) {
      if (options.failWrite) return response({}, 503);
      stored = JSON.parse(init.body);
      return response({ result: "OK" });
    }
    throw new Error("unexpected_fetch");
  };
  if (options.readBack === false) readBack = false;
  const res = mockResponse();
  try {
    await agentHandler({ method: "POST", headers: { authorization: "Bearer secret" }, body }, res);
    return { ...res.result(), state: stored, requests };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.url === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = originalEnv.url;
    if (originalEnv.token === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = originalEnv.token;
    if (originalEnv.secret === undefined) delete process.env.MC_SECRET; else process.env.MC_SECRET = originalEnv.secret;
  }
}

test("shared mission creation trims values, defaults status, and preserves existing work", () => {
  const state = baseState();
  const existingTask = structuredClone(state.missions[0].tasks[0]);
  const result = createMissionInState(state, { name: "  New Mission  ", note: "  A note  " }, {
    idFactory: () => "mission-1",
    expectedUpdatedAt: 10,
    now: () => 20,
  });

  assert.deepEqual(result.mission, { id: "mission-1", name: "New Mission", note: "A note", status: DEFAULT_MISSION_STATUS });
  assert.equal(result.workspaceUpdatedAt, 20);
  assert.deepEqual(state.missions[0].tasks[0], existingTask);
  assert.deepEqual(state.inbox[0].text, "Keep this");
  assert.deepEqual(state.missions.at(-1).tasks, []);
});

test("shared mission creation accepts an explicit status and rejects empty names", () => {
  const state = baseState();
  const explicit = createMissionInState(state, { name: "Pitched", status: " pitch ", note: "" }, { idFactory: () => "mission-2" });
  assert.equal(explicit.mission.status, "PITCH");
  assert.equal(createMissionInState(state, { name: " \t" }).error, "invalid_mission_name");
  assert.equal(state.missions.length, 2);
});

test("shared mission creation detects exact and case-insensitive duplicates", () => {
  const state = baseState();
  assert.equal(findDuplicateMission(state.missions, "existing mission").id, "existing-1");
  const duplicate = createMissionInState(state, { name: " EXISTING MISSION " });
  assert.equal(duplicate.error, "duplicate_mission");
  assert.equal(duplicate.duplicate.id, "existing-1");
  assert.equal(state.missions.length, 1);
});

test("shared mission creation returns state_changed without mutating state", () => {
  const state = baseState();
  const before = structuredClone(state);
  const result = createMissionInState(state, { name: "Stale" }, { expectedUpdatedAt: 9 });
  assert.equal(result.error, "state_changed");
  assert.deepEqual(state, before);
});

test("date-time defaults to tomorrow at 9 AM and preserves picker values", () => {
  const now = new Date(2026, 6, 22, 16, 30, 0, 0);
  const defaultValue = defaultWhenAt(now);
  assert.equal(defaultValue, "2026-07-23T09:00");
  assert.equal(datePart(defaultValue), "2026-07-23");
  assert.equal(timeLabel(defaultValue), "9:00 AM");
});

test("workos_create_mission requires explicit approval and creates one persisted mission", async () => {
  const state = baseState();
  const result = await callAgent(state, {
    action: "create_mission", name: "  Agent Mission ", note: "  Agent note ", status: "BUILD",
    expectedUpdatedAt: 10, approved: true,
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload.mission, {
    id: result.payload.mission.id, name: "Agent Mission", note: "Agent note", status: "BUILD",
  });
  assert.equal(result.state.missions.length, 2);
  assert.equal(result.state.missions[1].tasks.length, 0);
  assert.equal(result.payload.workspaceUpdatedAt, result.state.meta.updatedAt);
  assert.equal(result.requests.filter((request) => request.url.includes("/set/")).length, 1);

  const taskResult = await callAgent(result.state, {
    action: "apply_items", items: [{ text: "Approved first task", missionId: result.payload.mission.id }],
    expectedUpdatedAt: result.payload.workspaceUpdatedAt,
  });
  assert.equal(taskResult.statusCode, 200);
  assert.equal(taskResult.payload.created[0].missionId, result.payload.mission.id);
  assert.equal(taskResult.state.missions[1].tasks[0].text, "Approved first task");
  assert.equal(taskResult.state.missions[0].tasks[0].text, "Keep this task");
});

test("workos_create_mission rejects missing approval, duplicates, and stale reads", async () => {
  const missingApproval = await callAgent(baseState(), {
    action: "create_mission", name: "No Approval", expectedUpdatedAt: 10,
  });
  assert.equal(missingApproval.statusCode, 403);
  assert.equal(missingApproval.payload.error, "approval_required");

  const duplicate = await callAgent(baseState(), {
    action: "create_mission", name: "existing mission", expectedUpdatedAt: 10, approved: true,
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.payload.error, "duplicate_mission");

  const stale = await callAgent(baseState(), {
    action: "create_mission", name: "Stale Mission", expectedUpdatedAt: 9, approved: true,
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.payload.error, "state_changed");
});

test("workos_create_mission does not claim success when read-back verification fails", async () => {
  const result = await callAgent(baseState(), {
    action: "create_mission", name: "Unverified Mission", expectedUpdatedAt: 10, approved: true,
  }, { readBack: false });
  assert.equal(result.statusCode, 500);
  assert.equal(result.payload.error, "persistence_verification_failed");
});

test("homepage contains the shared mission flow and required accessible controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-act="openMission"[^>]*>\+ New mission/);
  assert.match(html, /id="missionSectionName"[^>]*aria-label="Mission section name"/);
  assert.match(html, /data-act="openMission"[^>]*aria-label="Create new mission"/);
  assert.match(html, /s\.settings\.missionSectionName = "Missions"/);
  assert.match(html, /id="missionName"[^>]*required/);
  assert.match(html, /id="missionNote"/);
  assert.match(html, /id="missionStatus"/);
  assert.match(html, /createMissionInState\(state, input, \{ idFactory: uid \}\)/);
  assert.match(html, /missionSave\.disabled = busy/);
  assert.match(html, /Could not save this mission on the device/);
  assert.match(html, /type="datetime-local" class="ed-when"/);
  assert.match(html, /defaultWhenAt\(\)/);
  assert.match(html, /document\.getElementById\("qeWhen"\)\.value = defaultWhenAt\(\)/);
  assert.match(html, /whenAt/);
});


test("mission API reports failed writes and mismatched read-back, rejecting malformed approval/version", async () => {
  const request = {action:"create_mission",name:"New",expectedUpdatedAt:10,approved:true};
  assert.equal((await callAgent(baseState(), request, {failWrite:true})).statusCode,500);
  assert.equal((await callAgent(baseState(), request, {mismatch:true})).payload.error,"persistence_verification_failed");
  for (const input of [{...request,approved:false},{...request,expectedUpdatedAt:undefined},{...request,status:"INVALID"}]) {
    const result = await callAgent(baseState(), input);
    assert.ok(result.statusCode >= 400);
    assert.equal(result.requests.filter(r=>r.url.includes('/set/')).length,0);
  }
});
