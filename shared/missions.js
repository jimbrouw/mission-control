export const MISSION_STATUSES = ["LIVE", "BUILD", "PITCH", "PARKED"];
export const DEFAULT_MISSION_STATUS = "BUILD";
export const MAX_MISSION_NAME_LENGTH = 200;
export const MAX_MISSION_NOTE_LENGTH = 1000;

export function defaultMissionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "mission_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function normalizeMissionInput(input, statuses = MISSION_STATUSES) {
  if (!input || typeof input !== "object") {
    return { error: "invalid_mission", message: "Mission details are required." };
  }
  if (typeof input.name !== "string") {
    return { error: "invalid_mission_name", message: "Mission name must be text." };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "invalid_mission_name", message: "Mission name cannot be empty." };
  }
  if (name.length > MAX_MISSION_NAME_LENGTH) {
    return { error: "invalid_mission_name", message: `Mission name must be ${MAX_MISSION_NAME_LENGTH} characters or fewer.` };
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > MAX_MISSION_NOTE_LENGTH) {
    return { error: "invalid_mission_note", message: `Mission note must be ${MAX_MISSION_NOTE_LENGTH} characters or fewer.` };
  }

  const requestedStatus = typeof input.status === "string" ? input.status.trim().toUpperCase() : "";
  const status = requestedStatus || DEFAULT_MISSION_STATUS;
  if (!statuses.includes(status)) {
    return { error: "invalid_mission_status", message: `Mission status must be one of: ${statuses.join(", ")}.` };
  }

  return { name, note, status };
}

export function findDuplicateMission(missions, name) {
  const normalizedName = name.trim().toLocaleLowerCase();
  return (Array.isArray(missions) ? missions : []).find((mission) =>
    typeof mission.name === "string" && mission.name.trim().toLocaleLowerCase() === normalizedName,
  ) || null;
}

export function missionSummary(mission) {
  return {
    id: String(mission.id || ""),
    name: String(mission.name || ""),
    note: String(mission.note || ""),
    status: String(mission.status || ""),
  };
}

export function createMissionInState(state, input, options = {}) {
  const normalized = normalizeMissionInput(input, options.statuses || MISSION_STATUSES);
  if (normalized.error) return normalized;

  const currentUpdatedAt = Number(state && state.meta && state.meta.updatedAt) || 0;
  if (options.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== currentUpdatedAt) {
    return {
      error: "state_changed",
      message: "Work OS changed since it was read. Read the workspace again before creating this mission.",
      workspaceUpdatedAt: currentUpdatedAt,
    };
  }

  const duplicate = findDuplicateMission(state && state.missions, normalized.name);
  if (duplicate) {
    return {
      error: "duplicate_mission",
      message: `A mission named “${duplicate.name}” already exists.`,
      duplicate: missionSummary(duplicate),
    };
  }

  if (!state || typeof state !== "object") {
    return { error: "invalid_state", message: "Work OS state is not available." };
  }
  if (!Array.isArray(state.missions)) state.missions = [];
  if (!state.meta || typeof state.meta !== "object") state.meta = {};

  const idFactory = options.idFactory || defaultMissionId;
  const mission = {
    id: String(idFactory()),
    name: normalized.name,
    note: normalized.note,
    status: normalized.status,
    tasks: [],
  };
  state.missions.push(mission);

  const now = typeof options.now === "function" ? Number(options.now()) : Date.now();
  state.meta.updatedAt = Math.max(Number.isFinite(now) ? now : Date.now(), currentUpdatedAt + 1);
  return { mission: missionSummary(mission), workspaceUpdatedAt: state.meta.updatedAt };
}
