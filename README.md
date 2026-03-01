# Claude CoWork Auto-Memory

Persistent memory for [Claude CoWork](https://claude.ai/cowork) that works across every session and folder. Claude automatically remembers people, preferences, terms, projects, and decisions — just like Claude Code's built-in auto-memory.

## How it works

```
┌─────────────────────────────────────────────────────┐
│  Claude CoWork (any folder, any session)             │
│                                                      │
│  "Marco prefers dark mode and uses Tailwind"        │
│         │                                            │
│         ▼                                            │
│  MCP Server (runs on your machine)                   │
│         │                                            │
│         ▼                                            │
│  ~/Documents/claude-memory/                          │
│    ├── MEMORY.md        ← core memory (150 lines)   │
│    ├── people.md        ← overflow: people details   │
│    ├── projects.md      ← overflow: project details  │
│    └── _stats.md        ← session counter            │
└─────────────────────────────────────────────────────┘
```

- Memory lives on **your machine** — nothing is sent to external servers
- Works across **every folder and session** — not tied to a single project
- Claude **auto-saves** relevant knowledge as you talk (no commands needed)
- Every 10 sessions, Claude runs **maintenance** to prune stale entries and stay under limits

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

This installs dependencies, builds the server, generates a local TLS certificate, and installs [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) (for the HTTPS tunnel).

### 2. Start the server

```bash
./start.sh
```

You'll see output like:

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

### 3. Add to CoWork

1. Open **Claude CoWork**
2. Go to **Customize** (gear icon) → **Connectors** → **Add connector**
3. Enter:
   - **Name:** `Auto Memory`
   - **URL:** paste the URL from step 2
4. Click **Add**

### 4. Add global instructions (recommended)

In CoWork → **Settings** → **Global Instructions**, paste:

```
At the start of every session, use your memory tools: call memory_stats
then memory_read to load your persistent memory. Save new knowledge
as you learn it during conversation. Follow the auto-memory skill
instructions for when and how to save.
```

This tells Claude to use memory in every session automatically.

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

# Stop (when done)
./stop.sh
# or just Ctrl+C in the terminal
```

**Note:** The tunnel URL changes each time you restart. You'll need to update the connector URL in CoWork after restarting. This is a limitation of the free Cloudflare tunnel — a fixed URL requires a [Cloudflare account](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).

## Slash command

Once connected, you can use `/memory` in CoWork:

```
/memory status      — Show memory stats
/memory review      — Force a maintenance cycle
/memory search X    — Search memory for "X"
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

Topic files are only created when MEMORY.md approaches its 150-line cap. You'll start with just MEMORY.md and _stats.md.

**You can edit these files directly.** They're plain markdown — open them in any text editor.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `CLAUDE_MEMORY_DIR` | `~/Documents/claude-memory` | Where memory files are stored |
| `CLAUDE_MEMORY_PORT` | `3847` | Local server port |

Example:
```bash
CLAUDE_MEMORY_DIR=~/my-memory ./start.sh
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Claude CoWork (VM sandbox)       │
│                                          │
│  Skill instructions tell Claude          │
│  when/how to use memory tools            │
│         │                                │
│         │ MCP protocol over HTTPS        │
└─────────┼────────────────────────────────┘
          │
  ┌───────┼────────────────────┐
  │  Cloudflare Tunnel (HTTPS) │
  └───────┼────────────────────┘
          │
  ┌───────┼────────────────────┐
  │  MCP Memory Server         │  ← runs on your machine
  │  (Node.js, port 3847)      │
  │                             │
  │  6 tools:                   │
  │  memory_read, memory_write  │
  │  memory_search, memory_list │
  │  memory_stats, memory_init  │
  └───────┬─────────────────────┘
          │
  ┌───────┼─────────────────────┐
  │  ~/Documents/claude-memory/  │
  │  Plain markdown files        │
  └──────────────────────────────┘
```

## Troubleshooting

**"Failed to add connector" in CoWork**
- Make sure `./start.sh` is running and the URL starts with `https://`
- The tunnel URL changes on every restart — copy the fresh URL

**Server won't start**
- Check if port 3847 is in use: `lsof -i :3847`
- Check logs: `cat /tmp/claude-memory-server.log`

**Tunnel won't start**
- Check logs: `cat /tmp/claude-memory-tunnel.log`
- Make sure cloudflared is installed: `cloudflared --version`

**Claude doesn't use memory automatically**
- Verify the connector shows as connected in CoWork → Customize → Connectors
- Add the global instructions from step 4 above
- Try explicitly: "Use your memory tools to read your memory"

**Memory stored in wrong location**
- Default is `~/Documents/claude-memory/`
- Override with `CLAUDE_MEMORY_DIR` env var

## Comparison with Claude Code auto-memory

| Feature | Claude Code | This Plugin |
|---------|------------|-------------|
| Persistent across sessions | Built-in | Yes (via MCP) |
| Cross-project/folder | Yes | Yes |
| Auto-saves knowledge | Engine-level | Skill instructions (~95%) |
| Memory cap | 200 lines | 150 lines |
| Topic file overflow | Yes | Yes |
| Maintenance/pruning | Automatic | Every 10 sessions |
| Slash command | /memory | /memory |
| Editable by user | Yes (markdown) | Yes (markdown) |

## License

MIT
