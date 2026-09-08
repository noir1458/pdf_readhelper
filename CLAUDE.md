# PDF Read Helper — Claude Code Instructions

@AGENT.md

Before making changes:

1. Read AGENT.md completely.
2. Inspect the current working tree and existing implementation.
3. Follow the architecture and constraints documented in AGENT.md.
4. Do not silently change major architectural decisions.
5. If a major architectural change is justified, update the Decision Log first.
6. Preserve existing user work.
7. Run relevant checks after changes.
8. Before ending a session, update AGENT.md:
   - Completed
   - In progress
   - Next
   - Blockers
   - any new important decision

Project commands:

- `npm run check` — typecheck, lint, test, and build
- `npm run dev` — rebuild the unpacked extension on changes

Do not claim a browser-dependent feature works unless it has either:

- been actually verified, or
- been explicitly marked as needing manual Chrome verification.

Never put secrets or API keys in this repository.
