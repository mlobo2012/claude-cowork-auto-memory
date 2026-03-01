---
description: View, manage, or reset your persistent auto-memory
argument-hint: "<status|review|search|reset|export> [query]"
---

# /memory

Manage your persistent auto-memory across sessions.

## Usage

```
/memory status          — Show memory stats (files, entries, session count)
/memory review          — Force a maintenance cycle now
/memory search <query>  — Search all memory files for a term
/memory reset           — Clear all memory (requires confirmation)
/memory export          — Combine all memory into a single document
```

Process this command: $ARGUMENTS

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        /memory                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /memory status                                                  │
│  ✓ Show total files, entries, and lines                         │
│  ✓ Show MEMORY.md usage vs. 150-line cap                        │
│  ✓ Show session count and last maintenance date                 │
│                                                                  │
│  /memory review                                                  │
│  ✓ Run full maintenance cycle immediately                       │
│  ✓ Prune stale entries (>60 days, unreferenced)                 │
│  ✓ Merge duplicate entries                                      │
│  ✓ Verify line cap compliance                                   │
│  ✓ Report what was changed                                      │
│                                                                  │
│  /memory search <query>                                          │
│  ✓ Search across MEMORY.md and all topic files                  │
│  ✓ Show matching lines with file references                     │
│                                                                  │
│  /memory reset                                                   │
│  ✓ Ask for confirmation before proceeding                       │
│  ✓ Delete all memory files and start fresh                      │
│  ✓ Re-initialize with blank MEMORY.md template                  │
│                                                                  │
│  /memory export                                                  │
│  ✓ Combine MEMORY.md + all topic files into one document        │
│  ✓ Output to screen or save to a file in the current folder     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Processing

Based on the argument provided:

### status
Call `memory_stats` and display the results in a clean, readable format.

### review
Run the full maintenance protocol:
1. Call `memory_read` to load MEMORY.md.
2. Call `memory_list` to find all topic files.
3. Read each topic file.
4. Prune entries older than 60 days that show no evidence of re-use.
5. Merge any duplicate or overlapping entries.
6. Verify MEMORY.md is under 150 lines — if over, move overflow to topic files.
7. Write updated files back using `memory_write`.
8. Report a summary of changes to the user.

### search
Call `memory_search` with the user's query and display results.

### reset
1. Ask the user to confirm: "This will permanently delete all stored memories. Type 'confirm' to proceed."
2. If confirmed, delete all memory files and call `memory_init` to create a fresh template.
3. If not confirmed, cancel.

### export
1. Call `memory_list` to get all files.
2. Read each file with `memory_read`.
3. Combine into a single markdown document with file headers.
4. Display to the user or save to the current working folder if requested.
