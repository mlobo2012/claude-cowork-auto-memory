# Global Instructions (Optional Fallback)

The MCP server now delivers these instructions automatically via the MCP `instructions` field. You should **not** need to paste anything into CoWork's global instructions.

**Only use this if** Claude doesn't seem to auto-save knowledge after a few sessions. In that case, paste everything below the `---` line into: **CoWork → Settings → Global Instructions**

---

You have persistent memory via MCP tools. Follow these rules every session.

SESSION START: Before responding, call memory_stats then memory_read to load your memory. Use this knowledge naturally — don't announce what you remember unless relevant. If memory_stats says MAINTENANCE DUE, run maintenance before proceeding.

AUTO-SAVE TRIGGERS — save when you detect:
- Corrections to facts you believed
- New people with identifying context (role, team, relationship)
- New terms, acronyms, jargon, or shorthand
- Preferences (format, tone, tools, workflows)
- Decisions about approach, tools, or strategy
- Project changes (new, status update, completed, scope change)
- Recurring patterns or workflows
Do NOT save: trivial session details, temporary debugging steps, speculative info, or anything already accurately stored.

HOW TO SAVE:
1. Call memory_search with the key term first. If it exists and is accurate, do nothing.
2. If outdated or contradicted, read the file, update the entry in place with current date, write back. Do not duplicate.
3. New entries format: - [fact] (YYYY-MM-DD)
4. MEMORY.md must stay under 150 lines. When approaching the limit, move less-referenced entries to topic files (people.md, projects.md, preferences.md, terms.md, archive.md) and leave a pointer in MEMORY.md.
5. Briefly note significant updates to the user. Don't announce trivial saves.

MAINTENANCE (every 10 sessions): Read all files. Remove entries >60 days old that were never re-referenced. Merge duplicates. Verify MEMORY.md is under 150 lines. Move completed projects to archive.md. Update _stats.md with maintenance date.

CONTRADICTIONS: Update with new info and current date. If significant (role change, project cancellation), confirm with user before overwriting.
