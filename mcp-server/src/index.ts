#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "http";
import { createServer as createHttpsServer } from "https";
import crypto from "crypto";

// Memory directory — configurable via env var, defaults to ~/Documents/claude-memory
const MEMORY_DIR =
  process.env.CLAUDE_MEMORY_DIR ||
  path.join(os.homedir(), "Documents", "claude-memory");

const MEMORY_FILE = "MEMORY.md";
const STATS_FILE = "_stats.md";
const MAX_LINES = 150;

// --- Helpers ---

async function ensureMemoryDir(): Promise<void> {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

async function memoryPath(filename: string): Promise<string> {
  await ensureMemoryDir();
  return path.join(MEMORY_DIR, filename);
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function readMemoryFile(filename: string): Promise<string> {
  const filepath = await memoryPath(filename);
  if (await fileExists(filepath)) {
    return await fs.readFile(filepath, "utf-8");
  }
  return "";
}

async function writeMemoryFile(
  filename: string,
  content: string
): Promise<void> {
  const filepath = await memoryPath(filename);
  // Ensure subdirectory exists for nested files like memory/people.md
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, content, "utf-8");
}

async function listMemoryFiles(): Promise<string[]> {
  await ensureMemoryDir();
  const files: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relative);
      } else if (entry.name.endsWith(".md")) {
        files.push(relative);
      }
    }
  }

  await walk(MEMORY_DIR, "");
  return files.sort();
}

async function searchFiles(query: string): Promise<string> {
  const files = await listMemoryFiles();
  const results: string[] = [];
  const queryLower = query.toLowerCase();

  for (const file of files) {
    const content = await readMemoryFile(file);
    const lines = content.split("\n");
    const matches: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matches.push(`  L${i + 1}: ${lines[i]}`);
      }
    }

    if (matches.length > 0) {
      results.push(`**${file}** (${matches.length} matches):`);
      results.push(...matches);
      results.push("");
    }
  }

  if (results.length === 0) {
    return `No matches found for "${query}" across ${files.length} memory files.`;
  }

  return results.join("\n");
}

async function getStats(): Promise<string> {
  const files = await listMemoryFiles();
  let totalLines = 0;
  let totalEntries = 0;

  for (const file of files) {
    const content = await readMemoryFile(file);
    const lines = content.split("\n");
    totalLines += lines.length;
    totalEntries += lines.filter((l) => l.trim().startsWith("- ")).length;
  }

  // Read stats file
  const statsContent = await readMemoryFile(STATS_FILE);

  // Parse session count
  const sessionMatch = statsContent.match(/Session count:\s*(\d+)/);
  const sessionCount = sessionMatch ? parseInt(sessionMatch[1]) : 0;

  const mainContent = await readMemoryFile(MEMORY_FILE);
  const mainLines = mainContent.split("\n").length;

  return [
    "# Memory Stats",
    "",
    `- **Files:** ${files.length}`,
    `- **Total lines:** ${totalLines}`,
    `- **Total entries:** ${totalEntries}`,
    `- **MEMORY.md lines:** ${mainLines} / ${MAX_LINES} cap`,
    `- **Session count:** ${sessionCount}`,
    `- **Memory directory:** ${MEMORY_DIR}`,
    "",
    "## Files:",
    ...files.map((f) => `- ${f}`),
  ].join("\n");
}

async function incrementSession(): Promise<number> {
  const statsPath = await memoryPath(STATS_FILE);
  let content = await readMemoryFile(STATS_FILE);

  if (!content) {
    content = [
      "# Memory Stats",
      `- Session count: 1`,
      `- Last maintenance: never`,
      `- Created: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n");
    await writeMemoryFile(STATS_FILE, content);
    return 1;
  }

  const match = content.match(/Session count:\s*(\d+)/);
  const current = match ? parseInt(match[1]) : 0;
  const next = current + 1;

  content = content.replace(
    /Session count:\s*\d+/,
    `Session count: ${next}`
  );
  await writeMemoryFile(STATS_FILE, content);
  return next;
}

async function initMemory(): Promise<string> {
  await ensureMemoryDir();
  const memPath = await memoryPath(MEMORY_FILE);

  if (await fileExists(memPath)) {
    return "Memory already initialized. MEMORY.md exists.";
  }

  const template = [
    "# Memory",
    "",
    "> Persistent memory maintained automatically. Keep under 150 lines.",
    "",
    "## People",
    "",
    "## Preferences",
    "",
    "## Key Terms",
    "",
    "## Projects",
    "",
    "## Decisions",
  ].join("\n");

  await writeMemoryFile(MEMORY_FILE, template);
  await writeMemoryFile(
    STATS_FILE,
    [
      "# Memory Stats",
      "- Session count: 0",
      "- Last maintenance: never",
      `- Created: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n")
  );

  return `Memory initialized at ${MEMORY_DIR}`;
}

// --- MCP Server ---

// Layer 1: Server instructions — full behavioral protocol delivered automatically on connect.
// No user setup required. This is the MCP spec's purpose-built mechanism for guiding model behavior.
const SERVER_INSTRUCTIONS = `You have persistent memory via this MCP server. Follow these rules every session.

SESSION START: Before responding to the user, call memory_stats then memory_read to load your memory. Use this knowledge naturally — do not announce what you remember unless directly relevant. If memory_stats says MAINTENANCE DUE, run maintenance before proceeding.

AUTO-SAVE TRIGGERS — save when you detect any of these during conversation:
- Corrections to facts you stated or believed
- New people with identifying context (role, team, relationship)
- New terms, acronyms, jargon, or shorthand the user uses
- Preferences for how the user likes things done (format, tone, tools, workflows)
- Decisions about approach, tools, direction, or strategy
- Project changes (new projects, status updates, completions, scope changes)
- Recurring patterns, workflows, or habits you notice
Do NOT save: trivial session details, temporary debugging steps, speculative info, or anything already accurately stored in memory.

HOW TO SAVE:
1. Call memory_search with the key term first. If the info already exists and is accurate, do nothing.
2. If outdated or contradicted, read the file, update the entry in place with the current date, and write back. Do not duplicate.
3. New entries format: - [fact] (YYYY-MM-DD)
4. MEMORY.md must stay under 150 lines. When approaching the limit, move less-referenced entries to topic files (people.md, projects.md, preferences.md, terms.md, archive.md) and leave a one-line pointer in MEMORY.md.
5. Briefly note significant memory updates to the user ("Noted — updated Sarah's location in memory."). Don't announce trivial saves.

MAINTENANCE (every 10 sessions, when memory_stats says MAINTENANCE DUE):
1. Read all memory files. 2. Remove entries older than 60 days that were never re-referenced.
3. Merge duplicate or overlapping entries. 4. Verify MEMORY.md is under 150 lines.
5. Move completed projects to archive.md. 6. Update _stats.md with maintenance date.

CONTRADICTIONS: Update the entry with new info and current date. If the change is significant (role change, project cancellation, preference reversal), briefly confirm with the user before overwriting.`;

// Layer 2: Enhanced tool descriptions — reinforce key behaviors at point of use.
function registerTools(server: McpServer): void {

server.tool(
  "memory_read",
  "Read a memory file. Defaults to MEMORY.md (the main hot cache). Call this at the start of every session immediately after memory_stats to load persistent memory. Use the loaded knowledge naturally without announcing it.",
  {
    file: z
      .string()
      .optional()
      .default(MEMORY_FILE)
      .describe(
        'Filename to read, relative to memory directory. Defaults to "MEMORY.md".'
      ),
  },
  async ({ file }) => {
    const content = await readMemoryFile(file);
    if (!content) {
      return {
        content: [
          {
            type: "text" as const,
            text: `File "${file}" not found. Use memory_init to create the memory directory, or memory_write to create this file.`,
          },
        ],
      };
    }
    return { content: [{ type: "text" as const, text: content }] };
  }
);

server.tool(
  "memory_write",
  "Write content to a memory file. Overwrites the entire file. IMPORTANT: Always call memory_search first to check if the info already exists — do not duplicate. Use entry format: - [fact] (YYYY-MM-DD). Keep MEMORY.md under 150 lines; overflow to topic files (people.md, projects.md, preferences.md, terms.md, archive.md).",
  {
    file: z
      .string()
      .optional()
      .default(MEMORY_FILE)
      .describe(
        'Filename to write, relative to memory directory. Defaults to "MEMORY.md".'
      ),
    content: z.string().describe("The full content to write to the file."),
  },
  async ({ file, content }) => {
    await writeMemoryFile(file, content);
    const lines = content.split("\n").length;
    // Layer 3: Tool response guidance — contextual warnings at the moment they matter.
    let warning = "";
    if (file === MEMORY_FILE && lines > MAX_LINES) {
      warning = `\n\nWARNING: MEMORY.md is ${lines} lines (cap is ${MAX_LINES}). Move less-used entries to topic files.`;
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Written ${lines} lines to ${file}.${warning}`,
        },
      ],
    };
  }
);

server.tool(
  "memory_search",
  "Search for a term across all memory files. Returns matching lines with file and line numbers. Always call this before memory_write to avoid duplicating existing entries.",
  {
    query: z.string().describe("The search term (case-insensitive)."),
  },
  async ({ query }) => {
    const results = await searchFiles(query);
    return { content: [{ type: "text" as const, text: results }] };
  }
);

server.tool(
  "memory_list",
  "List all files in the memory directory. Useful during maintenance to understand what topic files exist.",
  {},
  async () => {
    const files = await listMemoryFiles();
    if (files.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No memory files found. Use memory_init to initialize.",
          },
        ],
      };
    }
    return {
      content: [{ type: "text" as const, text: files.join("\n") }],
    };
  }
);

server.tool(
  "memory_stats",
  "Get memory statistics and increment session counter. Call this FIRST at the start of every session, before memory_read. If the result says MAINTENANCE DUE, run the maintenance protocol before proceeding with the conversation.",
  {},
  async () => {
    const sessionCount = await incrementSession();
    const stats = await getStats();

    // Layer 3: Maintenance trigger in tool response
    let maintenanceNote = "";
    if (sessionCount % 10 === 0) {
      maintenanceNote =
        "\n\n**MAINTENANCE DUE:** Session count is a multiple of 10. Run maintenance: read all files, remove stale entries (>60 days, never re-referenced), merge duplicates, verify MEMORY.md is under 150 lines, archive completed projects, update _stats.md with maintenance date.";
    }

    return {
      content: [
        { type: "text" as const, text: stats + maintenanceNote },
      ],
    };
  }
);

server.tool(
  "memory_init",
  "Initialize the memory directory with a blank MEMORY.md template. Safe to call if already initialized. Only needed on first use.",
  {},
  async () => {
    const result = await initMemory();
    return { content: [{ type: "text" as const, text: result }] };
  }
);

} // end registerTools

// Server options with instructions — delivered automatically to every client on connect
const SERVER_OPTIONS = {
  instructions: SERVER_INSTRUCTIONS,
};

// Create a default server for stdio mode
const server = new McpServer(
  { name: "claude-cowork-memory", version: "1.0.0" },
  SERVER_OPTIONS,
);
registerTools(server);

// --- Start server ---

const PORT = parseInt(process.env.CLAUDE_MEMORY_PORT || "3847");
const MODE = process.env.CLAUDE_MEMORY_TRANSPORT || "http"; // "http" or "stdio"

// Session management for persistent MCP connections
const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createRequestHandler() {
  return async (req: IncomingMessage, res: ServerResponse) => {
    // Log all requests with headers for debugging
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.error(`  Headers: ${JSON.stringify({
      accept: req.headers.accept,
      "content-type": req.headers["content-type"],
      "mcp-session-id": req.headers["mcp-session-id"],
      authorization: req.headers.authorization ? "(present)" : "(none)",
    })}`);

    // CORS headers — wide open for maximum compatibility
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS" || req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health endpoint
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", memoryDir: MEMORY_DIR }));
      return;
    }

    // OAuth well-known endpoints — return "no auth required"
    if (req.url?.startsWith("/.well-known/")) {
      console.error(`  -> Well-known request (returning 404 — no auth required)`);
      res.writeHead(404);
      res.end();
      return;
    }

    // MCP endpoint — accept /mcp, /mcp/, and /
    const mcpPath = req.url === "/mcp" || req.url === "/mcp/" || req.url === "/";
    if (!mcpPath) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      try {
        // If we have a session ID, reuse the existing transport
        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          await session.transport.handleRequest(req, res);
          return;
        }

        // New connection — create session with transport
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });

        const reqServer = new McpServer(
          { name: "claude-cowork-memory", version: "1.0.0" },
          SERVER_OPTIONS,
        );
        registerTools(reqServer);

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            sessions.delete(sid);
            console.error(`[session] Closed: ${sid}`);
          }
        };

        await reqServer.connect(transport);
        await transport.handleRequest(req, res);

        const newSessionId = transport.sessionId;
        if (newSessionId) {
          sessions.set(newSessionId, { transport, server: reqServer });
          console.error(`[session] Created: ${newSessionId}`);
        }
      } catch (err) {
        console.error(`  -> POST error: ${err}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    if (req.method === "GET") {
      // SSE stream for existing session
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }
      // GET without session — return server info (for validation/health checks)
      console.error(`  -> GET /mcp without session — returning server info`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: "claude-cowork-memory",
        version: "1.0.0",
        status: "ok",
        protocol: "MCP",
        protocolVersion: "2025-03-26",
      }));
      return;
    }

    if (req.method === "DELETE") {
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        sessions.delete(sessionId);
        console.error(`[session] Deleted: ${sessionId}`);
        return;
      }
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  };
}

async function startHttp(): Promise<void> {
  await ensureMemoryDir();

  const handler = createRequestHandler();

  // Try HTTPS first (required by CoWork), fall back to HTTP
  // Certs live at mcp-server/certs/ — dist/ is one level below
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const certDir = path.join(__dirname, "..", "certs");
  let useHttps = false;
  let tlsKey: string | undefined;
  let tlsCert: string | undefined;

  try {
    tlsKey = await fs.readFile(path.join(certDir, "key.pem"), "utf-8");
    tlsCert = await fs.readFile(path.join(certDir, "cert.pem"), "utf-8");
    useHttps = true;
  } catch {
    // No certs found, fall back to HTTP
  }

  if (useHttps) {
    const httpsServer = createHttpsServer({ key: tlsKey, cert: tlsCert }, handler);
    httpsServer.listen(PORT, () => {
      console.error(`Claude CoWork Memory Server running on https://localhost:${PORT}/mcp`);
      console.error(`Memory directory: ${MEMORY_DIR}`);
      console.error(`Health check: https://localhost:${PORT}/health`);
    });
  } else {
    const httpServer = createHttpServer(handler);
    httpServer.listen(PORT, () => {
      console.error(`Claude CoWork Memory Server running on http://localhost:${PORT}/mcp`);
      console.error(`Memory directory: ${MEMORY_DIR}`);
      console.error(`Health check: http://localhost:${PORT}/health`);
    });
  }
}

async function startStdio(): Promise<void> {
  await ensureMemoryDir();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Claude CoWork Memory Server running on stdio (memory dir: ${MEMORY_DIR})`
  );
}

async function main(): Promise<void> {
  if (MODE === "stdio") {
    await startStdio();
  } else {
    await startHttp();
  }
}

main().catch((error: Error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
