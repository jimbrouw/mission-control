# Work OS agent-native V1

## Goal

Ship and production-prove a review-first Codex hand-off: raw notes become a proposed task list, then only explicitly approved tasks are added to Work OS and visible on mobile after sync.

## Current state

- [x] Browser braindump triage UI in `index.html`: paste, AI proposal, edit/skip/destination review, confirm.
- [x] `api/triage.js`: authenticated Gemini proposal endpoint; it never writes state.
- [x] Production API proof: Gemini returned a live task proposal from `https://workos-jim.vercel.app/api/triage` (22 July 2026); no state was written.
- [x] `api/agent.js`: authenticated, task-level workspace read and approved-task creation API.
- [x] Local Codex MCP server and `$workos` skill.
- [x] Vercel project renamed to `work-os`; clean public address is `https://workos-jim.vercel.app`.

## Setup

1. In Vercel, add `GEMINI_API_KEY` to Preview and Production, then redeploy. `GEMINI_API_SECRET` and `GEMINI_API_secret` are accepted for compatibility, but use `GEMINI_API_KEY` for new setup.
2. Add this uncommitted entry to your local Codex configuration:

```toml
[mcp_servers.workos]
command = "npm"
args = ["run", "mcp:workos"]
cwd = "/Users/jim/Developer/mission-control"
env_vars = ["WORKOS_SECRET"]

[mcp_servers.workos.env]
WORKOS_URL = "https://workos-jim.vercel.app"
```

3. Set the local `WORKOS_SECRET` login-session variable to the same value as Vercel's `MC_SECRET`; do not put either value in this file.
4. Restart Codex, then use: `$workos organise this dump: ...`

Do not commit `WORKOS_SECRET`, a `.env` file containing it, or a Codex config containing it.

## LLM implementation blocks

### Block 1 — production proposal proof

- [x] Live Gemini proposal endpoint returned a result using `GEMINI_API_KEY`.
- [x] The endpoint is proposal-only: no task count changed during the proof.
- [ ] Optional manual browser acceptance: paste an 8+ line braindump, edit a title, change a destination, skip a result, confirm, then reload mobile to check the approved items persist. This has not been run because it would create real tasks.

### Block 2 — local MCP proof

- [x] Local MCP server starts and reads only open tasks/missions.
- [x] A live workspace read returned 11 open tasks; live triage returned a proposal without changing that count.
- [ ] Optional write acceptance: explicitly approve one or two proposed items with the returned `workspaceUpdatedAt`, then confirm they appear after reload. This requires the owner's approval and has not been run.

### Block 3 — safety proof

- [x] Invalid passphrase returns `unauthorized` from deployed endpoints.
- [x] Local mocked checks cover unknown mission IDs and the stale-state guard; neither writes state.
- [x] MCP exposes only workspace read, proposal triage, and explicitly approved task creation — no delete, complete, move, or replace operation.

## Acceptance

- [x] Deployed triage API works with `GEMINI_API_KEY`; the browser review interface is deployed.
- [x] `$workos` proposes tasks before writing anything.
- [x] Only explicit approval can create tasks; no other mutation route exists.
- [ ] Created tasks appear after a mobile reload — pending an owner-approved real task creation.
- [x] No secrets are committed.

## Not in V1

Hosted ChatGPT/browser MCP, OAuth, automatic writes, task deletion, task completion, and automatic new-mission creation.
