# Work OS agent-native V1

## Goal

Ship and production-prove a review-first Codex hand-off: raw notes become a proposed task list, then only explicitly approved tasks are added to Work OS and visible on mobile after sync.

## Current state

- [x] Browser braindump triage UI in `index.html`: paste, AI proposal, edit/skip/destination review, confirm.
- [x] `api/triage.js`: authenticated Gemini proposal endpoint; it never writes state.
- [ ] Production proof: add `GEMINI_API_KEY` to Vercel, redeploy, and exercise the real deployed flow.
- [x] `api/agent.js`: authenticated, task-level workspace read and approved-task creation API.
- [x] Local Codex MCP server and `$workos` skill.

## Setup

1. In Vercel, add `GEMINI_API_KEY` to Preview and Production, then redeploy. `GEMINI_API_SECRET` and `GEMINI_API_secret` are accepted for compatibility, but use `GEMINI_API_KEY` for new setup.
2. Add this uncommitted entry to your local Codex configuration:

```toml
[mcp_servers.workos]
command = "npm"
args = ["run", "mcp:workos"]
cwd = "/Users/jim/Developer/mission-control"

[mcp_servers.workos.env]
WORKOS_URL = "https://mission-control-dusky-gamma.vercel.app"
WORKOS_SECRET = "<MC_SECRET>"
```

3. Restart Codex, then use: `$workos organise this dump: ...`

Do not commit `WORKOS_SECRET`, a `.env` file containing it, or a Codex config containing it.

## LLM implementation blocks

### Block 1 — production proof

- Paste a real 8+ line braindump in deployed Work OS.
- Edit one title, change one destination, skip one result, and confirm.
- Reload the app and mobile device; confirm every approved item persists.
- Record pass/fail and exact error text if the Gemini key or sync auth fails.

### Block 2 — local MCP proof

- Run `npm install` and configure the local `workos` MCP server above.
- Ask Codex to call `workos_get_workspace` and verify it returns only open tasks and missions.
- Ask Codex to triage a small dump; confirm no task count changes before approval.
- Explicitly approve two items with the returned `workspaceUpdatedAt`, then confirm `workos_apply_items` adds exactly those two tasks.

### Block 3 — safety proof

- Try an invalid passphrase: endpoint returns `unauthorized`.
- Try an unknown mission ID: `apply_items` returns `unknown_mission` and writes nothing.
- Change Work OS between proposal and approval: `apply_items` returns `state_changed` and writes nothing.
- Confirm no MCP tool can delete, complete, move, or replace existing state.

## Acceptance

- [ ] Deployed browser triage works with `GEMINI_API_KEY` and sync.
- [ ] `$workos` proposes tasks before writing anything.
- [ ] Only explicit approval creates tasks.
- [ ] Created tasks appear after a mobile reload.
- [ ] No secrets are committed.

## Not in V1

Hosted ChatGPT/browser MCP, OAuth, automatic writes, task deletion, task completion, and automatic new-mission creation.
