import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = String(process.env.WORKOS_URL || "").replace(/\/$/, "");
const secret = String(process.env.WORKOS_SECRET || "");
if (!baseUrl || !secret) {
  process.stderr.write("WORKOS_URL and WORKOS_SECRET must be set.\n");
  process.exit(1);
}

async function callWorkOs(path, init = {}) {
  const response = await fetch(baseUrl + path, {
    ...init,
    headers: { Authorization: "Bearer " + secret, ...(init.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch (error) { /* surface status below */ }
  if (!response.ok) throw new Error((body && body.error ? body.error : "request_failed") + " (HTTP " + response.status + ")");
  return body;
}
function result(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }; }
function failure(error) { return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }; }

const server = new McpServer({ name: "workos", version: "1.0.0" });

server.registerTool("workos_get_workspace", {
  title: "Get Work OS workspace",
  description: "Read open Work OS tasks and missions. This tool never changes Work OS.",
  inputSchema: {}, annotations: { readOnlyHint: true },
}, async () => {
  try { return result(await callWorkOs("/api/agent")); } catch (error) { return failure(error); }
});

server.registerTool("workos_triage_dump", {
  title: "Triage a Work OS braindump",
  description: "Turn raw notes into a proposed task list. It never writes Work OS; present the proposal for user approval.",
  inputSchema: { rawText: z.string().min(1).max(12000) }, annotations: { readOnlyHint: true },
}, async ({ rawText }) => {
  try {
    const workspace = await callWorkOs("/api/agent");
    const missions = (workspace.workspace && workspace.workspace.missions ? workspace.workspace.missions : []).map((mission) => ({
      id: mission.id, name: mission.name, status: mission.status,
    }));
    const triage = await callWorkOs("/api/triage", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText, missions }),
    });
    return result({ ...triage, workspaceUpdatedAt: workspace.workspace.updatedAt });
  } catch (error) { return failure(error); }
});

server.registerTool("workos_apply_items", {
  title: "Apply approved Work OS tasks",
  description: "Create the supplied tasks in Work OS. Call only after the user explicitly approves this exact list; it cannot delete, complete, or overwrite tasks.",
  inputSchema: {
    items: z.array(z.object({
      text: z.string().min(1).max(200), note: z.string().max(500).optional(), missionId: z.string().nullable().optional(),
    })).min(1).max(60),
    expectedUpdatedAt: z.number().int().nonnegative(),
  },
  annotations: { destructiveHint: true },
}, async ({ items, expectedUpdatedAt }) => {
  try {
    return result(await callWorkOs("/api/agent", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_items", items, expectedUpdatedAt }),
    }));
  } catch (error) { return failure(error); }
});

await server.connect(new StdioServerTransport());
