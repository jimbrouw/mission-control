---
name: workos
description: Safely triage Work OS brain dumps and hand approved tasks into the connected Work OS MCP. Use when the user asks to organise, clean up, structure, prioritise, or add a task dump to Work OS.
---

# Work OS

## Read and triage

1. Call `workos_get_workspace` before relying on current projects, tasks, duplicate context, or the workspace version.
2. Call `workos_triage_dump` for raw notes. Treat its output as a proposal, never as a completed change.
3. Present a compact numbered review: title, destination, and any ambiguity or duplicate warning.
4. Wait for explicit approval of the exact task items to add.
5. Only then call `workos_apply_items`, using `missionId: null` for Inbox and the proposal's `workspaceUpdatedAt` value.
6. Report the created tasks and destinations from the tool result.
7. If `state_changed` is returned, read the workspace again and re-propose the exact task list for renewed approval. Do not retry the old approval.

Never delete, complete, move or rename existing tasks, or replace workspace state through this skill.

## Create a mission

When a new mission is needed, never create one speculatively from a brain dump.

1. Read the current workspace with `workos_get_workspace`.
2. Propose exactly one new mission with its exact name, note, and initial status. Include any exact or case-insensitive duplicate warning.
3. Ask the user for explicit approval of that exact mission.
4. Only after approval, call `workos_create_mission` once with the read version in `expectedUpdatedAt` and `approved: true`.
5. If `state_changed` is returned, read the workspace again and request renewed approval for the exact mission. Do not retry the old approval.
6. Report the persisted mission name and ID from the tool result.
7. Add tasks only after the mission exists, using its returned ID and a fresh `workspaceUpdatedAt` value.

Mission creation must create only one mission, never merge or overwrite an existing mission, and must not delete, complete, move, or rename anything. If a task proposal suggests a new mission, keep it as a proposal until the user approves the exact mission.
