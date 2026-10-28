# Shared AI agent instructions

Follow any existing project-specific instructions (including `CLAUDE.md`) and the project’s normal safety/review rules. This file adds cross-assistant continuity, not a replacement for other instructions.

## At the start of work
1. Read `AI_HANDOFF.md` and applicable project documentation and instructions.
2. Verify actual branch, working tree, commits, open PRs and relevant source files. The handoff is context, not proof that work is done.
3. Say what was last verified, what remains, and what you will do first.

## At handoff / task completion
1. Update `AI_HANDOFF.md` with UTC time, assistant, goal, branch/PR, files changed, verified results and checks, unfinished work, blockers and a precise next action.
2. Commit and push the handoff on the task branch when authorized, ideally in the same PR as the work. Do not silently push directly to `main`.
3. If writing is unavailable, produce a copyable handoff and explicitly state that it was NOT saved.
4. Check for concurrent changes before editing; do not overwrite another assistant’s latest handoff.

Never include secrets, API keys, patient/client records, private messages or raw logs. Never change production data or deploy without explicit authorization. Do not mistake a read-only review for successful code continuation.
