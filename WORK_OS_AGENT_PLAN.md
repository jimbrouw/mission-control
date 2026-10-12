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
- [x] Owner-approved write proof: created exactly one Inbox item, `TEST — verify Work OS mobile sync`, with the live state version. A fresh read found it once and increased the open-task count from 11 to 12.

### Block 3 — safety proof

- [x] Invalid passphrase returns `unauthorized` from deployed endpoints.
- [x] Local mocked checks cover unknown mission IDs and the stale-state guard; neither writes state.
- [x] MCP exposes only workspace read, proposal triage, and explicitly approved task creation — no delete, complete, move, or replace operation.

## Acceptance

- [x] Deployed triage API works with `GEMINI_API_KEY`; the browser review interface is deployed.
- [x] `$workos` proposes tasks before writing anything.
- [x] Only explicit approval can create tasks; no other mutation route exists.
- [x] Created tasks appear after a mobile reload — owner confirmed the live mobile sync on 22 July 2026.
- [x] No secrets are committed.

## Not in V1

Hosted ChatGPT/browser MCP, OAuth, automatic writes, task deletion, task completion, and automatic new-mission creation.

## Daily priority and project handover — 12 October 2026

Status: locally verified with fixture data; not deployed or production proven.

### Repository audit

- Existing architecture: one HTML/CSS/JavaScript app, browser localStorage, authenticated `/api/state` whole-workspace Redis sync, proposal-only Gemini `/api/triage`, and constrained `/api/agent` via stdio MCP. No build pipeline is required.
- Existing UI provides Today/One Thing, projects, task ordering, dates, completion and a logbook. Local browser testing confirms the new flow works within it.
- The original checkout also has uncommitted mission-creation, datetime and UI changes. Its nine existing tests and syntax checks passed. Those changes are preserved there and deliberately excluded from this isolated PR based on `181a641`.
- Existing safeguards: MCP task creation is explicitly approval-only in tool instructions; `/api/agent` validates workspace versions and mission destinations. Approval is not a server-enforced token, duplicate task text is not rejected, and read/modify/write is not atomic. These are existing limitations, not guarantees supplied by this PR.
- Existing sync uses last-write-wins whole-state replacement and can lose concurrent edits. Its sync indicator also does not verify read-back. Do not interpret local save confirmation as cross-device proof. No live API or production data was accessed in this work.

### Implemented slice

Today suggests one available task: overdue/today deadline first, then Today, then LIVE, then ordered available work. Done, parked and future-start work are excluded (a due deadline overrides future start). Accepting copies text into the existing editable One Thing; it creates no task or calendar event. Replacing a different One Thing asks for confirmation.

Each project has `mission.handover` fields: completed/attempted, verification evidence, next, blocked, resume and updatedAt. They save through existing storage, survive reload, and copy as a short session handover. All claims are self-reported, and blank evidence stays “Not recorded.” Storage/clipboard failures are visible. This does not mark tasks complete or expose new MCP mutations. Handover retrieval through MCP is deferred; use Copy resume handover.

Changed implementation files: `index.html`, `shared/planning.js`, `package.json`; tests in `test/`; fixture screenshots in `evidence/`. `vercel.json` disables Git-triggered deployment only for this review branch, following https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled . No new environment variables, credentials, runtime dependencies or calendar permissions.

### Commands and proof

- `npm test` — four Node tests: ranking/exclusions/non-mutation, ordering, truthful evidence, existing API authentication/stale version/invalid destination/storage failure.
- `python3 -m http.server 8765 --bind 127.0.0.1` then `node test/browser-smoke.mjs` — requires Playwright and installed Chrome. Set `PLAYWRIGHT_PATH` to the installed Playwright package if outside this checkout. Tests use isolated local fixture storage and block all API calls.
- Browser checks: accept priority twice without duplicating tasks; save/reload all handover fields; literal HTML content; copy success and denied clipboard; mobile width at 390px; storage failure feedback; no JavaScript errors. Screenshots are fixture evidence, not real client data.
- `git diff --check` — whitespace validation. There is no existing lint/build command.

### Deferred / release boundary

No Calendar, VibeCount, background jobs or revenue ranking. Daily recommendations cannot establish commercial importance without additional data. Existing grant-specific UI is unchanged. Reconcile the original checkout's pending changes before release. Then, only after explicit release approval, trial sync on two devices and use the workflow for two weeks. No merge or deployment is part of this PR.

Rollback: revert this PR's code; existing app ignores the additive `mission.handover` data. Export/back up the workspace before a later release; do not clear storage to roll back. Branch-specific deployment exclusion does not alter other branches.
