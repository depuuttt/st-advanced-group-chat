# Contributing to Advanced Group Chat

Thank you for your interest in contributing! This extension is plain browser ES modules — no build step, no third-party dependencies, no server plugin.

## Getting started

1. Fork and clone this repository.
2. Point SillyTavern at your clone, or clone it directly into SillyTavern's extension folder (see below).
3. Run the tests: `npm test` (Node's built-in test runner — no dependencies to install).

## Reading SillyTavern's source and docs

This repository does **not** vendor SillyTavern's documentation. When you change how this extension uses a SillyTavern event or API, consult the SillyTavern source and docs in **your local SillyTavern checkout** (upstream repo: https://github.com/SillyTavern/SillyTavern).

If you use an AI coding agent (Claude Code, Codex, etc.), give it the path to your local SillyTavern via a **local agent-guidance file** so it can find the source. Keep that file out of git.

### Claude Code

Claude Code reads `CLAUDE.md` from the repo. Create a personal, gitignored `.claude.local.md` in the repository root:

1. Create the file `.claude.local.md` in the repository root.
2. Point it at your local SillyTavern checkout. Example:

   ```markdown
   # Local notes (not committed)

   ## Local SillyTavern checkout

   `C:\Tools\SillyTavern-Launcher\SillyTavern`

   Useful spots when checking SillyTavern's actual behavior:

   - `public/script.js` — the client entry: `eventSource`, `eventTypes`, `getContext()` (the `SillyTavern.getContext()` this extension calls), and the extension-settings save path.
   - `public/scripts/extensions.js` — how third-party extensions are discovered, loaded, enabled/disabled (`manifest.json`), and how `data/extensions/<folder>` is served.
   - `data/default-user/settings.json` — the persisted settings that hold `extensionSettings` (`st_advanced_group_chat` lives there).
   - After installing this extension via SillyTavern's "Install extension", the copy lands in `data/default-user/extensions/st-advanced-group-chat`.
   ```

3. Check that `.gitignore` ignores `.claude.local.md`. This repository's `.gitignore` already does; keep it that way if you fork.

Claude Code picks up `.claude.local.md` automatically alongside `CLAUDE.md` at session start, so the path is available without ever being committed.

### Other agents

For agents that read `AGENTS.md`, add a short "Local SillyTavern checkout" note to your own local conventions file (the equivalent mechanism in your agent). The same rule applies: machine-specific paths never belong in the committed guidance files.

## Where extensions live on disk

SillyTavern loads third-party extensions from `<SillyTavern>/data/<user>/extensions/<folder>`. To develop against your clone:

- Install this repository via SillyTavern's **Install extension** using your fork's git URL, then edit files under `data/<user>/extensions/st-advanced-group-chat`, or
- symlink that folder to your clone (advanced).

## Code conventions

- New group-chat features land as a new `src/` module plus a `registerFeature` call in `index.js` — not by editing existing modules. See `CLAUDE.md` for the architecture.
- Every entry into SillyTavern APIs (`getContext`, `Popup`, event source, `document`) reads them lazily and degrades to a `console.warn` prefixed `[st_advanced_group_chat]` — the extension must never take the host app down.
- `CLAUDE.md` and `AGENTS.md` have identical bodies (only the header differs). Any change to one must be made to the other in the same commit; `test/sync.test.js` fails when they drift.
- If you change documented user-facing behavior, update `README.md` in the same commit or `test/readme.test.js` fails.

## Pull requests

1. Make your change with tests (`node --test`).
2. Run `npm test` — all tests must pass.
3. Commit with a clear message and open a pull request.