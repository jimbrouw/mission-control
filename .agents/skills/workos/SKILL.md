---
name: workos
description: Safely triage Work OS brain dumps and hand approved tasks into the connected Work OS MCP. Use when the user asks to organise, clean up, structure, prioritise, or add a task dump to Work OS.
---

# Work OS

1. Call `workos_get_workspace` when current projects or duplicate context matters.
2. Call `workos_triage_dump` for raw notes. Treat its output as a proposal, never as a completed change.
3. Present a compact numbered review: title, destination, and any ambiguity or duplicate warning.
4. Wait for explicit approval of the exact items to add.
5. Only then call `workos_apply_items`, using `missionId: null` for Inbox and the proposal's `workspaceUpdatedAt` value.
6. Report the created tasks and destinations from the tool result.

Never delete, complete, move existing tasks, create a new mission, or overwrite state. If `state_changed` is returned, re-read and re-propose; do not retry the old approval. If a proposed new mission is useful, ask the user to create it in Work OS first, then target its returned ID.
