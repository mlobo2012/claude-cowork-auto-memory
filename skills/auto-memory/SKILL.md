---
name: auto-memory
description: Persistent memory across sessions and folders. Automatically remembers people, preferences, terms, projects, and decisions. Activates every session — read memory at start, save new knowledge as you work. Trigger on any conversation where the user shares information worth remembering, or when context from past sessions would be helpful.
---

# Auto Memory

You have persistent memory that survives across sessions and folders. Follow these protocols every session.

## Session Start Protocol

At the beginning of every session, before responding to the user:

1. Call `memory_stats` — this loads stats and increments the session counter.
2. Call `memory_read` — this loads MEMORY.md, your core long-term memory.
3. Use this knowledge naturally. Do not announce what you remember unless directly relevant.
4. If `memory_stats` says MAINTENANCE DUE, run the maintenance protocol (see below) before proceeding.

## When to Save (Auto-Write Triggers)

Save to memory when you detect any of the following during conversation:

- **Corrections:** User corrects a fact you stated or believed ("actually, Sarah moved to London")
- **New people:** Someone mentioned for the first time with identifying context (role, team, relationship)
- **New terms:** Acronyms, jargon, nicknames, or shorthand the user uses
- **Preferences:** How the user likes things done (format, tone, tools, workflows)
- **Decisions:** Choices made about approach, tools, direction, or strategy
- **Project changes:** New projects, status updates, completions, or scope changes
- **Patterns:** Recurring requests, workflows, or habits you notice

**Do NOT save:** Trivial session details, temporary debugging steps, speculative information, or anything already accurately stored in memory.

## How to Save

1. **Check first.** Call `memory_search` with the key term before writing. If the information already exists and is accurate, do nothing.
2. **Update, don't duplicate.** If the information exists but is outdated or contradicted, read the file, update the entry in place with the current date, and write back.
3. **Add new entries** in the format: `- [fact] (YYYY-MM-DD)`
4. **Respect the cap.** MEMORY.md must stay under 150 lines. When approaching the limit, move detailed or less-referenced entries to topic files (e.g., `people.md`, `projects.md`, `preferences.md`) and leave a one-line pointer in MEMORY.md.
5. **Be transparent.** Briefly note significant memory updates to the user: "Noted — updated Sarah's location in memory." Don't announce trivial saves.

## Topic File Management

When MEMORY.md approaches 150 lines, create topic files:

- `people.md` — Detailed info about individuals (role, team, relationships, preferences)
- `projects.md` — Project details, status, key dates, stakeholders
- `preferences.md` — User's workflow preferences, tool choices, format preferences
- `terms.md` — Glossary of acronyms, jargon, and shorthand
- `archive.md` — Completed projects, past decisions, historical context

Create files only when needed. Don't pre-create empty files.

## Maintenance Protocol (Every 10 Sessions)

When `memory_stats` indicates maintenance is due:

1. Read MEMORY.md and all topic files.
2. **Prune:** Remove entries older than 60 days that were never referenced in subsequent sessions.
3. **Merge:** Combine duplicate or overlapping entries into single entries.
4. **Verify:** Ensure MEMORY.md is under 150 lines.
5. **Archive:** Move completed project details to `archive.md`.
6. Update `_stats.md` with: `- Last maintenance: YYYY-MM-DD`

## Handling Contradictions

When new information contradicts stored memory:

1. Update the entry with the new information and current date.
2. If the change is significant (role change, project cancellation, preference reversal), briefly confirm with the user: "I have [old info] in memory — updating to [new info]."
3. Do not keep both the old and new versions.
