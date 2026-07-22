# WORK OS — BUILD PLAN (TASKS.md)

Rule of the plan: nothing in Phase 3+ gets built before 11 Aug unless Phase 2 is done.
Each task is sized S (< 1 hr), M (half day), L (day+). One task = one Claude Code session where possible.

---

## PHASE 0 — DONE (v3.1, this session)
- [x] Apple Health-style activity rings on Today (Ship / Tasks / Grant) — S
- [x] Ring-close celebration overlay + browser notification — S
- [x] Duolingo-style streak: flame, best streak, freezes (earn 1 per 7 days, max 2, auto-covers 1 missed day) — M
- [x] Editable daily task goal (Logbook) — S

## PHASE 1 — SHIP BEHAVIOUR (this week, before anything else)
- [ ] Morning gate — M
      Today shows only the One Thing input until it is filled. No list browsing before committing.
      Accept: open app with empty focus → only the oversized input renders.
- [ ] Session launcher — S
      Button on each project: copies the commit/resume prompt (CLAUDE.md / TASK.md style) to clipboard.
      Store the prompt template per project in mission.sessionPrompt.
      Accept: tap → clipboard contains prompt → paste into Claude Code works.
- [ ] Staleness marks — S
      Track mission.lastTouched (any task change). Show "untouched N days" on project rows when N >= 5.
      Accept: idle project shows the mark; ticking a task clears it.

## PHASE 2 — GRANT MODE (before 11 Aug, nothing else jumps this queue)
- [ ] Runway estimates — M
      Optional hours estimate per task (grant tasks first). Runway line shows hours remaining vs days left.
      Accept: estimates set → Today events card reads "~9h left · 24 days".
- [ ] T-7 submission checklist — S
      Pre-seeded IUK final-week checklist (attachments, confirmations cited, finances, portal upload test)
      auto-activates as a Today section when daysLeft <= 7.
      Accept: change system date to T-6 → checklist appears.
- [ ] Post-deadline autopilot — S
      On first open after 11 Aug: prompt "Grant submitted. Un-park Cast / Vibe Anything site?" One tap moves them to BUILD.
      Accept: after due date, prompt fires once, choices apply.

## PHASE 3 — CAPTURE (post-submission)
- [ ] AI braindump triage — production proof — S
      Implemented in `api/triage.js` and the Braindump review sheet. Add GEMINI_API_KEY in Vercel and prove paste → review → sync → mobile reload with real data.
- [ ] Braindump splitter — S
      Paste multi-line text into Inbox → one task per line, empty lines ignored.
      Built for Whisper Flow output. Accept: paste 8 lines → 8 tasks.
- [ ] Voice capture — M
      Mic button on Inbox using the Web Speech API, feeds the braindump splitter.
      [Unverified] Browser support varies; Safari/Chrome differ — needs a real-device test, fallback is paste.
- [ ] /api/capture endpoint — M
      POST { text } with the same Bearer passphrase → task lands in Inbox.
      Then: iOS Shortcut ("Add to Work OS") + one-line curl for Claude Code sessions.
      Accept: curl from laptop → task appears on phone within 90 s.

## PHASE 4 — PLATFORM (after capture, because push depends on PWA)
- [ ] Real PWA — M
      manifest.json (name, icons, standalone), service worker for offline shell + cached assets.
      Accept: Add to Home Screen shows proper icon; airplane mode → app opens and reads local state.
- [ ] Daily push nudge — L
      One notification at a chosen hour: "One Thing not set" or "streak at risk".
      Needs web push (VAPID) + a scheduled trigger (Vercel cron).
      [Unverified] iOS web push requires the Home Screen install and iOS 16.4+; behaviour varies by version.

## PHASE 5 — WORK OS AGENT NATIVE (after braindump production proof)
- [ ] Local Work OS MCP + `$workos` skill — M
      Codex reads open tasks, proposes braindump triage, then writes only the explicitly approved new tasks. Accept: approved tasks appear after a mobile reload.
- [ ] /api/brief morning brief — M
      Sends state to the Claude API, returns 3 lines: suggested One Thing, most at-risk project, one thing to drop.
      Renders at the top of Today before 10:00. Treat as a nudge, not an oracle.
- [ ] Inbox triage by AI — M
      One tap: AI proposes a destination project per inbox task; you confirm per item. Reuse the review-first Work OS agent workflow.
- [ ] Weekly review ritual — M
      Sunday view: ledger recap + keep / park / kill per project. Ten minutes, forced honesty.
- [ ] Ledger → invoice trail — L
      Tag shipped entries by client; export a month as CSV. Feeds T-Bone invoicing (links to VibeCount thinking).

## PHASE 6 — GUARDRAILS + POLISH (whenever they start to hurt)
- [ ] One LIVE lane hard cap — S
      Setting a second mission to LIVE forces choosing which one stays.
- [ ] No new projects inside T-14 — S
      New-project attempts route to Someday with a polite refusal while a LIVE deadline is < 14 days out.
- [ ] Drag to reorder tasks — L
      The missing Things behaviour. Touch + mouse. Only build when ordering actually annoys you.

---

## DEPENDENCY NOTES
- Push (P4) needs PWA (P4) needs nothing.
- /api/capture (P3) reuses the auth pattern from /api/state — build after grant, it touches the backend.
- Claude endpoints (P5) reuse /api plumbing; keep them out of the grant window on purpose.
- Guardrails (P6) are trivial code; schedule them whenever discipline slips.
