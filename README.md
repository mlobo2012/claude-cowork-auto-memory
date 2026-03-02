# Claude CoWork Auto-Memory

A plugin that gives [Claude CoWork](https://claude.ai/cowork) persistent memory across every session and folder. Claude automatically remembers people, preferences, terms, projects, and decisions — just like Claude Code's built-in auto-memory.

## The problem

Claude CoWork forgets everything when you start a new session. Every conversation starts from scratch — it doesn't know your name, your projects, your preferences, or the decisions you made yesterday. This plugin fixes that.

## How it works

The plugin has two parts that work together:

### 1. Behavioral instructions (the brain)

A set of rules you paste into CoWork's Global Instructions (see `GLOBAL-INSTRUCTIONS.md`). These teach Claude to:

- **Read memory** at the start of every session (so it knows who you are)
- **Auto-save** new knowledge as you talk — people, preferences, terms, projects, decisions
- **Check before writing** to avoid duplicates
- **Update, not duplicate** when information changes ("Sarah moved to London")
- **Run maintenance** every 10 sessions to prune stale entries and stay under limits
- **Handle contradictions** gracefully ("I have X in memory — updating to Y")

You don't need to say "remember this." Claude detects what's worth saving.

### 2. MCP server (the storage)

A local server that runs on your machine and provides 6 tools via the [Model Context Protocol](https://modelcontextprotocol.io/):

| Tool | What it does |
|------|-------------|
| `memory_read` | Read a memory file (loads MEMORY.md by default) |
| `memory_write` | Write/update a memory file |
| `memory_search` | Search across all memory files |
| `memory_list` | List all memory files |
| `memory_stats` | Get stats + increment session counter |
| `memory_init` | Initialize the memory directory |

Claude calls these tools automatically based on the skill instructions. You never interact with them directly (unless you want to via `/memory`).

### Why it needs both parts

CoWork runs in a sandboxed VM — it can only see the folder you select for each session. It **cannot** access files from previous sessions or other folders. The MCP server runs **outside** the sandbox on your machine, giving Claude access to a single shared memory store no matter which folder you're working in.

```
┌─────────────────────────────────────────────────────┐
│  Claude CoWork (sandboxed VM)                        │
│                                                      │
│  Skill instructions:                                 │
│  "Read memory at start, save knowledge as you go"   │
│         │                                            │
│         │  MCP protocol (HTTPS)                      │
└─────────┼────────────────────────────────────────────┘
          │
  ┌───────┼─────────────────────────┐
  │  Cloudflare Tunnel              │  ← gives localhost
  │  (pass-through, stores nothing) │    an https:// URL
  └───────┼─────────────────────────┘
          │
  ┌───────┼─────────────────────────┐
  │  MCP Memory Server              │  ← runs on your machine
  │  (Node.js, port 3847)           │
  │  6 tools for read/write/search  │
  └───────┼─────────────────────────┘
          │
  ┌───────┼─────────────────────────┐
  │  ~/Documents/claude-memory/      │  ← plain markdown files
  │  ├── MEMORY.md                   │    100% local, you own them
  │  ├── _stats.md                   │
  │  └── [topic files as needed]     │
  └──────────────────────────────────┘
```

**Privacy:** All memory is stored as plain markdown files on your machine. The Cloudflare tunnel is just a pass-through that gives your local server an `https://` URL (required by CoWork) — it does not store, log, or inspect your data.

## What's in this repo

```
claude-cowork-auto-memory/
├── install.sh                     ← One-time setup script
├── start.sh                       ← Start server + tunnel (run daily)
├── stop.sh                        ← Stop everything
│
├── skills/
│   └── auto-memory/
│       └── SKILL.md               ← Behavioral rules for auto-save
│
├── commands/
│   └── memory.md                  ← /memory slash command definition
│
├── mcp-server/
│   ├── src/index.ts               ← MCP server source (6 tools)
│   ├── package.json
│   └── tsconfig.json
│
├── .claude-plugin/
│   └── plugin.json                ← Plugin metadata
│
├── .mcp.json                      ← MCP connector config template
├── GLOBAL-INSTRUCTIONS.md         ← Copy-paste text for CoWork settings
└── README.md
```

## Requirements

- [Node.js](https://nodejs.org) v18+
- macOS or Linux
- [Claude CoWork](https://claude.ai/cowork) desktop app

## Setup (5 minutes)

### 1. Clone and install

```bash
git clone https://github.com/mlobo2012/claude-cowork-auto-memory.git
cd claude-cowork-auto-memory
chmod +x install.sh start.sh stop.sh
./install.sh
```

This installs Node dependencies, builds the MCP server, generates a local TLS certificate, and installs [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) (for the HTTPS tunnel).

### 2. Start the server

```bash
./start.sh
```

You'll see:

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   Your MCP Server URL (paste into CoWork):                   ║
║                                                              ║
║   https://abc-xyz-example.trycloudflare.com/mcp              ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Keep this terminal open while using CoWork.

### 3. Connect to CoWork

1. Open **Claude CoWork**
2. Go to **Customize** (gear icon) → **Connectors** → **Add connector**
3. Enter:
   - **Name:** `Auto Memory`
   - **URL:** paste the URL from step 2
4. Click **Add**

### 4. Add global instructions

This is what makes Claude actually **use** the memory tools automatically — reading at session start, auto-saving knowledge, running maintenance. Without this, Claude has the tools but won't use them proactively.

1. Open the file `GLOBAL-INSTRUCTIONS.md` in this repo
2. Copy everything below the `---` line
3. Go to CoWork → **Settings** → **Global Instructions**
4. Paste it in

This is ~25 lines that teach Claude the complete auto-save behavior: when to save, how to check for duplicates, how to handle contradictions, and when to run maintenance. It uses less than 1% of the context window.

### 5. Test it

Start a new CoWork session in any folder and say:

> "My name is [your name] and I prefer dark mode. Remember this."

Then start a **different** session (different folder) and ask:

> "What do you remember about me?"

Claude should recall your name and preference from the first session.

## Daily usage

```bash
# Start (run once when you begin working)
./start.sh

# Stop (when done for the day)
./stop.sh
# or just Ctrl+C in the terminal
```

**Note:** The tunnel URL changes each time you restart. You'll need to update the connector URL in CoWork after restarting. This is a limitation of the free Cloudflare tunnel — a fixed URL requires a [Cloudflare account](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).

## What Claude auto-saves

The skill instructions teach Claude to save when it detects:

| Trigger | Example |
|---------|---------|
| New people | "Sarah Chen is our VP of Product" |
| Corrections | "Actually, Sarah moved to London" |
| Preferences | "I prefer TypeScript over JavaScript" |
| Decisions | "Let's go with PostgreSQL for the database" |
| New terms | "We call the deploy pipeline 'the cannon'" |
| Project changes | "We launched v2 last week" |
| Patterns | Recurring workflows or requests |

Claude checks existing memory before writing (no duplicates) and updates entries in place when information changes.

## The /memory command

Once connected, you can use `/memory` in CoWork:

```
/memory status      — Show memory stats (files, entries, session count)
/memory review      — Force a maintenance cycle now
/memory search X    — Search all memory files for "X"
/memory reset       — Clear all memory (asks for confirmation)
/memory export      — Export all memory as one document
```

## How memory is stored

Everything is plain markdown at `~/Documents/claude-memory/`:

```
~/Documents/claude-memory/
├── MEMORY.md          ← Main memory (150-line cap, loaded every session)
├── _stats.md          ← Session counter, maintenance tracking
├── people.md          ← Overflow: detailed people info
├── projects.md        ← Overflow: project details
├── preferences.md     ← Overflow: workflow preferences
└── archive.md         ← Completed projects, old decisions
```

Only MEMORY.md and _stats.md exist at first. Topic files are created automatically when MEMORY.md approaches its 150-line cap.

**You can edit these files directly.** They're plain markdown — open them in any text editor and Claude will pick up your changes next session.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `CLAUDE_MEMORY_DIR` | `~/Documents/claude-memory` | Where memory files are stored |
| `CLAUDE_MEMORY_PORT` | `3847` | Local server port |

Example with custom memory location:
```bash
CLAUDE_MEMORY_DIR=~/my-memory ./start.sh
```

To sync memory across machines, point `CLAUDE_MEMORY_DIR` at a cloud-synced folder:
```bash
# iCloud (macOS)
CLAUDE_MEMORY_DIR=~/Library/Mobile\ Documents/com~apple~CloudDocs/claude-memory ./start.sh

# Dropbox
CLAUDE_MEMORY_DIR=~/Dropbox/claude-memory ./start.sh
```

## Troubleshooting

**"Failed to add connector" or auth error in CoWork**
- Make sure `./start.sh` is running and the URL starts with `https://`
- The tunnel URL changes on every restart — copy the fresh URL each time
- Check server logs: `cat /tmp/claude-memory-server.log`

**Server won't start**
- Check if port 3847 is in use: `lsof -i :3847`
- Check logs: `cat /tmp/claude-memory-server.log`

**Tunnel won't start**
- Check logs: `cat /tmp/claude-memory-tunnel.log`
- Make sure cloudflared is installed: `cloudflared --version`

**Claude doesn't use memory automatically**
- Verify the connector shows as connected in CoWork → Customize → Connectors
- Make sure global instructions are set (step 4 above)
- Try explicitly: "Use your memory tools to read your memory"

**Memory not found / empty on new machine**
- Memory is stored locally per machine at `~/Documents/claude-memory/`
- To share memory across machines, use a cloud-synced folder (see Configuration)

## Comparison with Claude Code auto-memory

| Feature | Claude Code | This Plugin |
|---------|------------|-------------|
| Persistent across sessions | Built-in | Yes (via MCP) |
| Cross-project/folder | Yes | Yes |
| Auto-saves knowledge | Engine-level (guaranteed) | Skill instructions (~95%) |
| Memory cap | 200 lines | 150 lines |
| Topic file overflow | Yes | Yes |
| Maintenance/pruning | Automatic | Every 10 sessions |
| Slash command | /memory | /memory |
| Editable by user | Yes (markdown) | Yes (markdown) |
| Privacy | Local files | Local files |

## License

MIT
