# Work OS agent-native V1

## Goal

Ship and production-prove a review-first Codex hand-off: raw notes become a proposed task list, then only explicitly approved tasks are added to Work OS and visible on mobile after sync.

## Current state

- [x] Browser braindump triage UI in `index.html`: paste, AI proposal, edit/skip/destination review, confirm.
- [x] `api/triage.js`: authenticated Gemini proposal endpoint; it never writes state.
- [x] Production API proof: Gemini returned a live task proposal from `https://workos-jim.vercel.app/api/triage` (22 July 2026); no state was written.
- [x] `api/agent.js`: authenticated workspace read, approved-task creation, and single-mission creation with optimistic concurrency.
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
- [x] Owner-approved write proof: created exactly one Inbox item, `TEST — verify Work OS mobile sync`, with the live state version. A fresh read found it once and increased the open-task count from 11 to 12.

### Block 3 — safety proof

- [x] Invalid passphrase returns `unauthorized` from deployed endpoints.
- [x] Local mocked checks cover unknown mission IDs and the stale-state guard; neither writes state.
- [x] MCP exposes workspace read, proposal triage, explicitly approved task creation, and explicitly approved single-mission creation — no delete, complete, move, rename, or replace operation.

## Acceptance

- [x] Deployed triage API works with `GEMINI_API_KEY`; the browser review interface is deployed.
- [x] `$workos` proposes tasks before writing anything.
- [x] MCP task creation requires exact-list approval in its instructions; mission creation also requires `approved: true`. Neither operation deletes or completes work.
- [x] Created tasks appear after a mobile reload — owner confirmed the live mobile sync on 22 July 2026.
- [x] No secrets are committed.

## Not in V1

Hosted ChatGPT/browser MCP, OAuth, automatic writes, task deletion, task completion, and speculative new-mission creation.

## Daily priority, handover and reconciliation — 12 October 2026

Status: locally verified with fixture data; not deployed or production proven.

### Audit and review outcome

The existing architecture is one HTML/CSS/JavaScript app with localStorage, authenticated `/api/state` whole-workspace Redis sync, proposal-only Gemini `/api/triage`, and constrained `/api/agent` through stdio MCP. No build pipeline is required.

PR #1 now reconciles the pending Work OS mission-creation, editable sidebar and local date/time changes with the daily-priority and project-handover workflow. The original checkout is preserved byte-for-byte for the reviewed files. Its HANDOVER.md and historical design-qa.md remain local references; unrelated worth-taking and .DS_Store are excluded. Work was reconciled using the common committed base, with overlapping imports, storage feedback and event handlers reviewed explicitly.

Review fixes:
- Quick-entry Today now wins over the default tomorrow date; explicit Today also wins over a prior future start when suggesting a priority.
- One Thing renders quoted task titles safely in its input attribute.
- Storage without persistent localStorage returns failure instead of reporting a save.
- Hidden mission dialogs cannot submit again, and reopening resets their busy controls.
- Restored the skill rule requiring renewed task-list approval after stale state.
- Refreshed seven packages within existing dependency ranges after a clean install reported advisories; npm audit now reports zero known vulnerabilities. The MCP transport test passes against the refreshed SDK.
- Git-triggered deployment is disabled for this PR branch and master in vercel.json so merge and release are separate decisions. Re-enable master only with explicit deployment approval; other branches retain their previous behavior.

### Delivered workflow

Today recommends one available task by due deadline, Today flag, LIVE status, then order. Completed and parked tasks are excluded; future-start tasks are excluded unless due or explicitly marked Today. Accepting fills the existing editable One Thing, asks before replacing a different choice, and creates no task/event.

Projects save `mission.handover` with completed/attempted, evidence, next, blocked, resume and updatedAt. Copy resume handover gives a short self-reported summary. Blank evidence is “Not recorded”; task completion is never inferred. New mission creation validates names/status, rejects duplicates, preserves existing tasks and exposes storage failure. MCP creation requires explicit approval, a workspace version and read-back verification. Native local date/time controls and the editable Missions heading persist through existing storage.

### Commands and verification

- `npm test`: 16 passing Node tests, including the reconciled mission suite, daily priority and actual local MCP stdio transport against a fixture HTTP service. Covers missing/false approval, stale versions, duplicates, unknown destinations, failed writes, mismatched read-back and external-call errors with no automatic retry.
- `npm ci --ignore-scripts` and `npm audit`: clean dependency installation; zero known advisories after compatible lockfile updates.
- `npm run check`: syntax checks for shared modules, API and MCP server.
- `python3 -m http.server 8765 --bind 127.0.0.1` then `node test/browser-smoke.mjs`: installed Chrome and Playwright required. Use `PLAYWRIGHT_PATH` for a Playwright package outside this checkout. The script blocks API calls and uses isolated fixture storage.
- Browser checks: accept priority twice without duplicate tasks; quoted titles; handover save/reload; escaped text; clipboard success/failure; 390px mobile width; storage failure feedback; mission create/duplicate/save failure (including storage disabled at startup on mobile); sidebar persistence; Today checkbox; date/time editor and reload. No JavaScript errors. Fixture screenshots are in `evidence/`.
- `git diff --check`: whitespace validation. There is no build/lint pipeline or remote CI configured.

### Remaining boundaries

Existing sync is last-write-wins whole-state replacement and can overwrite simultaneous device edits. The sync indicator is not read-back proof; a local save is not cross-device verification. Existing API version checking is not atomic across concurrent requests. Task approval is an MCP instruction, not a server-issued approval token; duplicate task text is not rejected. Mission approval and duplicate checks do not eliminate concurrent writer races. These existing architectural risks need a separate focused sync change, not a claim of production safety.

Calendar, VibeCount, background jobs, revenue-aware ranking and handover retrieval through MCP remain deferred. Use the copy button to resume in an agent. The old grant-specific UI is unchanged. No production API, secrets or calendar appointments were touched. No new runtime dependencies or environment variables are required.

Before a later approved deployment, export/back up the workspace, then test sync on two devices and trial the workflow. Keep master Git deployments disabled until release approval. Rollback is a code revert; the prior app ignores additive handover/date fields. Do not clear user storage.
